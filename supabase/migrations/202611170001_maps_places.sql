-- Extends the schema supplied on 2026-11-16. Run on a staging copy first.
-- Existing duplicate bookmarks abort this transaction; no user data is discarded.
begin;
set local lock_timeout = '5s';
alter table public.cities enable row level security;
alter table public.places enable row level security;
alter table public.saved_places enable row level security;
alter table public.reviews enable row level security;
alter table public.check_ins enable row level security;

do $$ begin
 if exists(select 1 from public.saved_places group by user_id,place_id having count(*)>1) then
  raise exception 'Duplicate bookmarks exist. Reconcile their notes before applying maps migration.';
 end if;
end $$;

alter table public.cities add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.places add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.saved_places add column if not exists status text not null default 'want_to_go';
alter table public.saved_places add column if not exists visited_at timestamptz;
alter table public.saved_places drop constraint if exists saved_places_status_check;
alter table public.saved_places add constraint saved_places_status_check check(status in ('want_to_go','visited'));
alter table public.saved_places drop constraint if exists saved_places_visit_state_check;
alter table public.saved_places add constraint saved_places_visit_state_check check(
 (status='want_to_go' and visited_at is null) or (status='visited' and visited_at is not null));
create unique index if not exists saved_places_user_place_maps_key on public.saved_places(user_id,place_id);

-- Keep legacy name resolution separate from externally identified locations.
alter table public.cities drop constraint if exists cities_normalized_name_key;
create unique index if not exists cities_legacy_name_maps_key on public.cities(normalized_name) where provider_id is null;
alter table public.places drop constraint if exists places_city_id_normalized_name_key;
-- Custom places are distinct records, even when their names match.

-- Record an explicit custom-city choice, including when another user first created the label.
create table public.maps_city_choices(
 user_id uuid not null references public.profiles(id) on delete cascade,
 city_id uuid not null references public.cities(id) on delete cascade,
 primary key(user_id,city_id)
);
alter table public.maps_city_choices enable row level security;
revoke all on public.maps_city_choices from public,anon,authenticated;
grant select on public.maps_city_choices to authenticated;
create policy maps_own_city_choices on public.maps_city_choices for select to authenticated using(user_id=auth.uid());

create or replace function public.resolve_city(label text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; clean text:=trim(label);
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if clean is null or length(clean) not between 1 and 150 then raise exception 'Enter a city and country'; end if;
 select city_id into result from public.city_aliases where alias=lower(clean);
 if result is not null then
  insert into public.maps_city_choices values(auth.uid(),result) on conflict do nothing;
  return result;
 end if;
 insert into public.cities(name,created_by) values(clean,auth.uid())
 on conflict(normalized_name) where provider_id is null do update set name=public.cities.name returning id into result;
 insert into public.maps_city_choices values(auth.uid(),result) on conflict do nothing;
 return result;
end $$;

create or replace function public.resolve_place(location uuid,label text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if label is null or length(trim(label)) not between 1 and 200 then raise exception 'Enter a place name'; end if;
 -- Legacy forms create private custom records. Reuse only this user's unlocated custom place.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||location::text||lower(trim(label)),0));
 select id into result from public.places where city_id=location and lower(trim(name))=lower(trim(label))
 and created_by=auth.uid() and provider_id is null and latitude is null order by created_at,id limit 1;
 if result is null then
  insert into public.places(city_id,name,created_by) values(location,trim(label),auth.uid()) returning id into result;
 end if;
 return result;
end $$;
revoke all on function public.resolve_city(text) from public,anon,authenticated;
revoke all on function public.resolve_place(uuid,text) from public,anon,authenticated;

create or replace function public.maps_can_read_place(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.places p where p.id=target and (
 p.provider_id like 'osm:%' or p.created_by=auth.uid()
 or exists(select 1 from public.saved_places s where s.place_id=p.id and s.user_id=auth.uid())
 or exists(select 1 from public.reviews r where r.place_id=p.id and (r.user_id=auth.uid() or public.is_member(r.community_id)))
 ));
$$;
create or replace function public.maps_can_read_city(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.cities c where c.id=target and (
 c.provider_id like 'osm:%' or c.created_by=auth.uid()
 or exists(select 1 from public.maps_city_choices choice where choice.city_id=c.id and choice.user_id=auth.uid())
 or exists(select 1 from public.profiles p where p.id=auth.uid() and p.home_city_id=c.id)
 or exists(select 1 from public.check_ins t where t.city_id=c.id and public.can_view_checkin(t.id))
 or exists(select 1 from public.saved_places s where s.city_id=c.id and s.user_id=auth.uid())
 or exists(select 1 from public.reviews r where r.city_id=c.id and (r.user_id=auth.uid() or public.is_member(r.community_id)))
 ));
$$;
revoke all on function public.maps_can_read_city(uuid),public.maps_can_read_place(uuid) from public,anon;
grant execute on function public.maps_can_read_city(uuid),public.maps_can_read_place(uuid) to authenticated;

-- Supplement existing relationship policies rather than exposing all legacy/custom data.
create policy maps_city_catalog on public.cities for select to authenticated
 using(provider_id like 'osm:%' or created_by=auth.uid()
 or exists(select 1 from public.maps_city_choices choice where choice.city_id=cities.id and choice.user_id=auth.uid()));
create policy maps_place_catalog on public.places for select to authenticated
 using(provider_id like 'osm:%' or created_by=auth.uid());

-- Applies only to these three tables; profile/meetup triggers retain legacy behavior.
create or replace function public.maps_link_location() returns trigger
language plpgsql security definer set search_path='' as $$
declare p public.places; c public.cities; label text; use_place boolean:=false;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if tg_table_name in ('saved_places','reviews') then
  label:=case when tg_table_name='saved_places' then to_jsonb(new)->>'name' else to_jsonb(new)->>'place' end;
  use_place:=new.place_id is not null;
  if tg_op='UPDATE' then
   -- Old clients editing text still work. Note/status edits preserve identity.
   if new.place_id is not distinct from old.place_id and
    (new.city is distinct from old.city or label is distinct from
      case when tg_table_name='saved_places' then to_jsonb(old)->>'name' else to_jsonb(old)->>'place' end) then use_place:=false; end if;
  end if;
  if use_place then
   if not public.maps_can_read_place(new.place_id) then raise exception 'Place unavailable'; end if;
   select * into strict p from public.places where id=new.place_id;
   if new.city_id is not null and new.city_id<>p.city_id then raise exception 'Place belongs to another city'; end if;
   new.city_id:=p.city_id;
   select * into strict c from public.cities where id=p.city_id;
   new.city:=c.name;
   if tg_table_name='saved_places' then new.name:=p.name; else new.place:=p.name; end if;
   return new;
  end if;
 end if;
 if tg_op='UPDATE' then
  if new.city_id is not distinct from old.city_id and new.city is distinct from old.city then new.city_id:=null; end if;
 end if;
 if new.city_id is null then
  new.city_id:=public.resolve_city(new.city);
 elsif not public.maps_can_read_city(new.city_id) then raise exception 'City unavailable'; end if;
 select * into strict c from public.cities where id=new.city_id;
 new.city:=c.name;
 if tg_table_name in ('saved_places','reviews') then new.place_id:=public.resolve_place(new.city_id,label); end if;
 return new;
end $$;
revoke all on function public.maps_link_location() from public,anon,authenticated;
drop trigger location_link on public.saved_places;
create trigger location_link before insert or update on public.saved_places for each row execute function public.maps_link_location();
drop trigger location_link on public.reviews;
create trigger location_link before insert or update on public.reviews for each row execute function public.maps_link_location();
drop trigger location_link on public.check_ins;
create trigger location_link before insert or update on public.check_ins for each row execute function public.maps_link_location();

create or replace function public.maps_save_city(label text) returns public.cities
language plpgsql security definer set search_path='' as $$
declare result public.cities; resolved uuid;
begin
 resolved:=public.resolve_city(label);
 select * into strict result from public.cities where id=resolved;
 return result;
end $$;

create or replace function public.maps_save_place(location uuid,place_name text,place_note text default '',
 existing_place uuid default null,lat double precision default null,lng double precision default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.places; c public.cities; result uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if not public.maps_can_read_city(location) then raise exception 'City unavailable'; end if;
 select * into strict c from public.cities where id=location;
 if existing_place is not null then
  if not public.maps_can_read_place(existing_place) then raise exception 'Place unavailable'; end if;
  select * into strict p from public.places where id=existing_place;
  if p.city_id<>location then raise exception 'Choose a place in the selected city'; end if;
 else
  if place_name is null or length(trim(place_name)) not between 1 and 200 then raise exception 'Enter a place name'; end if;
  insert into public.places(city_id,name,latitude,longitude,created_by)
   values(location,trim(place_name),lat,lng,auth.uid()) returning * into p;
 end if;
 insert into public.saved_places(user_id,city,city_id,name,place_id,note,category)
 values(auth.uid(),c.name,c.id,p.name,p.id,trim(place_note),p.category)
 on conflict(user_id,place_id) do nothing returning id into result;
 if result is null then select id into result from public.saved_places where user_id=auth.uid() and place_id=p.id; end if;
 return result;
end $$;

create or replace function public.maps_save_checkin(checkin_id uuid,location uuid,arrival_date date,
 departure_date date,trip_note text,groups uuid[]) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; label text;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if not public.maps_can_read_city(location) then raise exception 'City unavailable'; end if;
 select name into strict label from public.cities where id=location;
 perform 1 from public.communities where id=any(groups) order by id for share;
 if groups is null or exists(select 1 from unnest(groups) g where g is null or not public.is_member(g)) then
  raise exception 'You can only share with your groups'; end if;
 if checkin_id is null then
  insert into public.check_ins(user_id,city,city_id,arrival,departure,note)
  values(auth.uid(),label,location,arrival_date,departure_date,trip_note) returning id into result;
 else
  update public.check_ins set city=label,city_id=location,arrival=arrival_date,departure=departure_date,note=trip_note
  where id=checkin_id and user_id=auth.uid() returning id into result;
  if result is null then raise exception 'Check-in unavailable'; end if;
 end if;
 delete from public.check_in_shares where check_in_id=result;
 insert into public.check_in_shares(check_in_id,community_id) select result,g from (select distinct unnest(groups) g) x;
 return result;
end $$;

-- Preserve canonical home-city IDs too, without replacing shared legacy triggers.
create or replace function public.maps_link_profile() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.home_city_id is not distinct from old.home_city_id and new.home_city is distinct from old.home_city then new.home_city_id:=null; end if;
 end if;
 if new.home_city_id is null then
  new.home_city_id:=case when trim(new.home_city)='' then null else public.resolve_city(new.home_city) end;
 else
  if not public.maps_can_read_city(new.home_city_id) then raise exception 'City unavailable'; end if;
  select name into strict new.home_city from public.cities where id=new.home_city_id;
 end if;
 return new;
end $$;
drop trigger if exists location_link on public.profiles;
create trigger location_link before insert or update on public.profiles for each row execute function public.maps_link_profile();
revoke all on function public.maps_link_profile() from public,anon,authenticated;

-- Existing review edit policy must check the destination audience as well.
alter policy review_update on public.reviews with check(user_id=auth.uid() and public.is_member(community_id));

revoke all on function public.maps_save_city(text),public.maps_save_place(uuid,text,text,uuid,double precision,double precision),
 public.maps_save_checkin(uuid,uuid,date,date,text,uuid[]) from public,anon;
grant execute on function public.maps_save_city(text),public.maps_save_place(uuid,text,text,uuid,double precision,double precision),
 public.maps_save_checkin(uuid,uuid,date,date,text,uuid[]) to authenticated;

-- Server-only cache/limits: no rows or service credentials are exposed to clients.
create table public.maps_search_cache(
 cache_key text primary key, payload jsonb not null, expires_at timestamptz not null
);
alter table public.maps_search_cache enable row level security;
revoke all on public.maps_search_cache from public,anon,authenticated;
grant all on public.maps_search_cache to service_role;
create table public.maps_search_budget(bucket text primary key,started_at timestamptz not null,used integer not null);
alter table public.maps_search_budget enable row level security;
revoke all on public.maps_search_budget from public,anon,authenticated;
grant all on public.maps_search_budget to service_role;
create or replace function public.maps_take_search_budget(actor uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare b text; allowed integer; used_count integer;
begin
 -- Serialize all upstream reservations; one shared budget across function instances.
 perform pg_advisory_xact_lock(7319458201);
 delete from public.maps_search_budget where started_at<now()-interval '1 day';
 delete from public.maps_search_cache where expires_at<now();
 foreach b in array array['global',actor::text] loop
  allowed:=case when b='global' then 20 else 5 end;
  insert into public.maps_search_budget values(b,now(),1)
  on conflict(bucket) do update set
   used=case when maps_search_budget.started_at<now()-interval '1 minute' then 1 else maps_search_budget.used+1 end,
   started_at=case when maps_search_budget.started_at<now()-interval '1 minute' then now() else maps_search_budget.started_at end
  returning used into used_count;
  if used_count>allowed then return false; end if;
 end loop;
 return true;
end $$;
revoke all on function public.maps_take_search_budget(uuid) from public,anon,authenticated;
grant execute on function public.maps_take_search_budget(uuid) to service_role;

-- Accept only a cached result from our authenticated search service.
create or replace function public.maps_import_result(cache_id text,result_id text,location uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb; c public.cities; p public.places; provider text;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select value into item from public.maps_search_cache s cross join lateral jsonb_array_elements(s.payload->'results')
 where s.cache_key=cache_id and s.expires_at>now() and value->>'provider_id'=result_id;
 if item is null then raise exception 'Search expired. Search again.'; end if;
 provider:=item->>'provider_id';
 if provider !~ '^osm:(node|way|relation):[0-9]+$' then raise exception 'Invalid source'; end if;
 if item->>'kind'='city' then
  insert into public.cities(name,country_code,region,latitude,longitude,provider_id)
  values(item->>'name',nullif(item->>'country_code',''),coalesce(item->>'region',''),(item->>'latitude')::float8,(item->>'longitude')::float8,provider)
  on conflict(provider_id) do update set provider_id=excluded.provider_id returning * into c;
  return to_jsonb(c);
 end if;
 if location is null or not public.maps_can_read_city(location) then raise exception 'Choose a city'; end if;
 -- The search cache binds results to the city used by the backend.
 if item->>'city_id' is distinct from location::text then raise exception 'Search belongs to another city'; end if;
 insert into public.places(city_id,name,address,category,latitude,longitude,provider_id)
 values(location,item->>'name',coalesce(item->>'address',''),item->>'category',(item->>'latitude')::float8,(item->>'longitude')::float8,provider)
 on conflict(provider_id) do update set provider_id=excluded.provider_id returning * into p;
 if p.city_id<>location then raise exception 'Place already belongs to a different city'; end if;
 return to_jsonb(p);
end $$;
revoke all on function public.maps_import_result(text,text,uuid) from public,anon;
grant execute on function public.maps_import_result(text,text,uuid) to authenticated;
commit;
