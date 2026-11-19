-- Isolated test fixture, not a production baseline.

create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated,service_role;
create table public.profiles(id uuid primary key,home_city text not null default '',home_city_id uuid);
create table public.cities(id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 150),
 normalized_name text generated always as (lower(trim(name))) stored unique,country_code text,region text not null default '',
 latitude float8,longitude float8,provider_id text unique,created_at timestamptz default now(),check((latitude is null)=(longitude is null)),
 check(latitude between -90 and 90),check(longitude between -180 and 180));
create table public.city_aliases(alias text primary key,city_id uuid references cities);
create table public.places(id uuid primary key default gen_random_uuid(),city_id uuid not null references cities,name text not null check(length(trim(name)) between 1 and 200),
 normalized_name text generated always as(lower(trim(name))) stored,address text not null default '',latitude float8,longitude float8,provider_id text unique,
 category varchar,created_at timestamptz default now(),unique(city_id,normalized_name),check((latitude is null)=(longitude is null)),check(latitude between -90 and 90),check(longitude between -180 and 180));
create table public.communities(id uuid primary key);
create table public.memberships(user_id uuid,community_id uuid,primary key(user_id,community_id));
create function public.is_member(target uuid) returns boolean language sql stable security definer as $$select exists(select 1 from public.memberships where community_id=target and user_id=auth.uid())$$;
create table public.check_ins(id uuid primary key default gen_random_uuid(),user_id uuid not null references profiles,city text not null,city_id uuid not null references cities,
 arrival date not null,departure date not null,note text not null default '',created_at timestamptz default now(),updated_at timestamptz default now(),check(departure>=arrival));
alter table check_ins enable row level security;
create policy checkin_read on check_ins for select to authenticated using(user_id=auth.uid());
create policy checkin_insert on check_ins for insert to authenticated with check(user_id=auth.uid());
create policy checkin_update on check_ins for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create table public.check_in_shares(check_in_id uuid references check_ins,community_id uuid references communities,primary key(check_in_id,community_id));
create function public.can_view_checkin(target uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from public.check_ins where id=target and user_id=auth.uid()) or exists(select 1 from public.check_in_shares where check_in_id=target and public.is_member(community_id)) $$;
create table public.saved_places(id uuid primary key default gen_random_uuid(),user_id uuid not null references profiles,city text not null,city_id uuid not null references cities,
 name text not null,place_id uuid not null references places,note text not null default '' check(length(note)<=1000),category varchar,created_at timestamptz default now(),updated_at timestamptz default now());
create table public.reviews(id uuid primary key default gen_random_uuid(),user_id uuid not null references profiles,community_id uuid not null references communities,
 city text not null,city_id uuid not null references cities,place text not null,place_id uuid not null references places,rating int check(rating between 1 and 5),body text not null,created_at timestamptz default now(),updated_at timestamptz default now());
create function public.link_location() returns trigger language plpgsql security definer as $$ begin return new; end $$;
create trigger location_link before insert or update on check_ins for each row execute function link_location();
create trigger location_link before insert or update on saved_places for each row execute function link_location();
create trigger location_link before insert or update on reviews for each row execute function link_location();
alter table saved_places enable row level security;
create policy saved_owner on saved_places for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
alter table reviews enable row level security;
create policy review_read on reviews for select to authenticated using(user_id=auth.uid() or is_member(community_id));
create policy review_update on reviews for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy review_insert on reviews for insert to authenticated with check(user_id=auth.uid() and is_member(community_id));
alter table places enable row level security;
create policy place_read on places for select to authenticated using(exists(select 1 from saved_places s where s.place_id=places.id) or exists(select 1 from reviews r where r.place_id=places.id));
alter table cities enable row level security;
create policy city_read on cities for select to authenticated using(exists(select 1 from saved_places s where s.city_id=cities.id) or exists(select 1 from check_ins t where t.city_id=cities.id and can_view_checkin(t.id)));
grant select,insert,update,delete on all tables in schema public to authenticated;
insert into profiles(id) values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
insert into communities values('33333333-3333-4333-8333-333333333333'); insert into memberships values('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333');

alter table profiles add column full_name text not null default 'Member';
alter table profiles add column bio text not null default '';
alter table communities add column owner_id uuid references profiles;
alter table communities add column name text default 'Group';
alter table communities add column description text default '';
alter table memberships add column role text not null default 'member';
alter table memberships add column joined_at timestamptz default now();
update communities set owner_id='11111111-1111-4111-8111-111111111111';
create table connections(id uuid primary key default gen_random_uuid(),sender_id uuid references profiles,recipient_id uuid references profiles,status text not null,created_at timestamptz default now());
create table conversations(id uuid primary key default gen_random_uuid(),created_at timestamptz not null default now(),closed_at timestamptz);
create table conversation_members(conversation_id uuid references conversations on delete cascade,user_id uuid references profiles on delete cascade,primary key(conversation_id,user_id));
create table messages(id uuid primary key default gen_random_uuid(),sender_id uuid references profiles,conversation_id uuid references conversations on delete cascade,body text not null,created_at timestamptz not null default now());
create table invites(id uuid primary key default gen_random_uuid(),community_id uuid references communities on delete cascade,token uuid default gen_random_uuid(),created_at timestamptz default now());
alter table messages enable row level security;
create policy messages_member on messages for select to authenticated using(exists(select 1 from conversation_members m where m.conversation_id=messages.conversation_id and m.user_id=auth.uid()));
create policy message_sender on messages for insert to authenticated with check(sender_id=auth.uid());
alter table profiles enable row level security;
create policy profile_read on profiles for select to authenticated using(true);
alter table connections enable row level security;
create policy connection_participant on connections for all to authenticated using(auth.uid() in (sender_id,recipient_id)) with check(auth.uid() in (sender_id,recipient_id));
grant select,insert,update,delete on all tables in schema public to authenticated;

create policy conversation_member_read on conversation_members for select to authenticated using(true);
