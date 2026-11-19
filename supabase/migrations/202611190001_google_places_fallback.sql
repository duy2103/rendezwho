begin;
set local lock_timeout = '5s';
-- Persist identifiers and user-authored labels only, never Google result details.
alter table public.places add column google_place_id text;
alter table public.places add constraint places_google_id_check check (
 google_place_id is null or (google_place_id ~ '^[A-Za-z0-9_-]{1,255}$'
 and provider_id is null and latitude is null and longitude is null
 and coalesce(address,'')='' and category is null));
create unique index places_google_owner_key on public.places(created_by,city_id,google_place_id)
 where google_place_id is not null;

create table public.maps_google_budget(month text primary key,used integer not null);
alter table public.maps_google_budget enable row level security;
revoke all on public.maps_google_budget from public,anon,authenticated;
grant all on public.maps_google_budget to service_role;
create function public.maps_take_google_budget(monthly_limit integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare used_count integer; current_month text:=to_char(now() at time zone 'America/Los_Angeles','YYYY-MM');
begin
 if monthly_limit is null or monthly_limit not between 1 and 5000 then return false; end if;
 insert into public.maps_google_budget values(current_month,1)
 on conflict(month) do update set used=maps_google_budget.used+1
 where maps_google_budget.used<monthly_limit returning used into used_count;
 return used_count is not null;
end $$;
revoke all on function public.maps_take_google_budget(integer) from public,anon,authenticated;
grant execute on function public.maps_take_google_budget(integer) to service_role;

create function public.maps_save_google_place(cache_id text,result_id text,location uuid,place_label text,place_note text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare item jsonb; p public.places; google_id text;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if not public.maps_can_read_city(location) then raise exception 'City unavailable'; end if;
 if place_label is null or length(trim(place_label)) not between 1 and 200 then raise exception 'Enter your own label'; end if;
 if place_note is null or length(place_note)>1000 then raise exception 'Note is too long'; end if;
 select value into item from public.maps_search_cache s, lateral jsonb_array_elements(s.payload->'results')
 where s.cache_key=cache_id and s.expires_at>now() and value->>'provider_id'=result_id
 and value->>'city_id'=location::text;
 if item is null or result_id !~ '^google:[A-Za-z0-9_-]{1,255}$' then raise exception 'Search again to select this Google place'; end if;
 google_id:=substring(result_id from 8);
 insert into public.places(city_id,name,created_by,google_place_id)
 values(location,trim(place_label),auth.uid(),google_id)
 on conflict(created_by,city_id,google_place_id) where google_place_id is not null
 do update set google_place_id=excluded.google_place_id returning * into p;
 return public.maps_save_place(location,p.name,place_note,p.id);
end $$;
revoke all on function public.maps_save_google_place(text,text,uuid,text,text) from public,anon;
grant execute on function public.maps_save_google_place(text,text,uuid,text,text) to authenticated;
commit;
