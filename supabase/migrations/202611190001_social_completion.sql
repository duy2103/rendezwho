-- Requires the original application schema and 202611170001_maps_places.sql.
-- Apply to staging first; this migration does not replace existing visibility policies.
begin;
set local lock_timeout = '5s';
alter table public.profiles add column if not exists onboarding_completed_at timestamptz;
alter table public.messages add column if not exists client_key text;
create unique index if not exists messages_retry_key on public.messages(sender_id,client_key) where client_key is not null;
create index if not exists messages_history_cursor on public.messages(conversation_id,created_at desc,id desc);
create index if not exists memberships_user_lookup on public.memberships(user_id,community_id);

create table public.app_blocks (
 blocker_id uuid not null references public.profiles(id) on delete cascade,
 blocked_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(blocker_id,blocked_id), check(blocker_id<>blocked_id)
);
create index app_blocks_reverse on public.app_blocks(blocked_id,blocker_id);
create table public.app_moderators(user_id uuid primary key references public.profiles(id) on delete cascade);
create table public.app_suspensions(user_id uuid primary key references public.profiles(id) on delete cascade,reason text not null,created_at timestamptz not null default now());
create table public.app_reports(
 id uuid primary key default gen_random_uuid(), reporter_id uuid references public.profiles(id) on delete set null,
 target_type text not null check(target_type in ('profile','message','review','community','meetup')), target_id uuid not null,
 reason text not null check(length(trim(reason)) between 3 and 2000), evidence jsonb not null,
 status text not null default 'open' check(status in ('open','reviewing','resolved','dismissed')),
 resolution text not null default '', created_at timestamptz not null default now()
);
create table public.app_moderation_log(
 id uuid primary key default gen_random_uuid(), moderator_id uuid references public.profiles(id) on delete set null,
 report_id uuid references public.app_reports(id) on delete set null, action text not null, note text not null, created_at timestamptz not null default now()
);
create table public.app_rate_limits(user_id uuid references public.profiles(id) on delete cascade,action text,started_at timestamptz not null,used integer not null,primary key(user_id,action));
create table public.app_notifications(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 actor_id uuid references public.profiles(id) on delete cascade, kind text not null,
 target_id uuid not null, event_key text not null, created_at timestamptz not null default now(), read_at timestamptz,
 unique(user_id,event_key)
);
create index app_notifications_inbox on public.app_notifications(user_id,created_at desc,id desc);
create table public.app_notification_preferences(
 user_id uuid primary key references public.profiles(id) on delete cascade,
 messages boolean not null default true, connections boolean not null default true, meetups boolean not null default true
);
create table public.app_conversation_reads(
 user_id uuid not null references public.profiles(id) on delete cascade,
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 read_at timestamptz not null, primary key(user_id,conversation_id)
);

create function public.app_is_moderator() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.app_moderators where user_id=auth.uid());
$$;
create function public.app_is_active() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.profiles where id=auth.uid()) and not exists(select 1 from public.app_suspensions where user_id=auth.uid());
$$;
create function public.app_blocked(other uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.app_blocks where (blocker_id=auth.uid() and blocked_id=other) or (blocker_id=other and blocked_id=auth.uid()));
$$;
create function public.app_take_budget(kind text, maximum integer) returns void language plpgsql security definer set search_path='' as $$
declare used_count integer;
begin
 if not public.app_is_active() then raise exception 'Account unavailable'; end if;
 insert into public.app_rate_limits values(auth.uid(),kind,now(),1)
 on conflict(user_id,action) do update set
 used=case when app_rate_limits.started_at<now()-interval '1 minute' then 1 else app_rate_limits.used+1 end,
 started_at=case when app_rate_limits.started_at<now()-interval '1 minute' then now() else app_rate_limits.started_at end returning used into used_count;
 if used_count>maximum then raise exception 'Too many attempts. Try again in a minute.'; end if;
end $$;

-- Keep original RLS rules, adding mandatory safety checks with restrictive policies.
do $$ declare t text; begin
 foreach t in array array['profiles','check_ins','reviews','connections','messages','communities','memberships','invites','saved_places','check_in_shares','conversations','conversation_members'] loop
  execute format('alter table public.%I enable row level security',t);
 end loop;
 foreach t in array array['check_ins','reviews','saved_places','check_in_shares','communities','memberships','invites','connections','messages'] loop
  execute format('create policy app_active_insert on public.%I as restrictive for insert to authenticated with check(public.app_is_active())',t);
  execute format('create policy app_active_update on public.%I as restrictive for update to authenticated using(public.app_is_active()) with check(public.app_is_active())',t);
 end loop;
end $$;
create policy app_profile_block on public.profiles as restrictive for select to authenticated using(not public.app_blocked(id));
create policy app_trip_block on public.check_ins as restrictive for select to authenticated using(not public.app_blocked(user_id));
create policy app_review_block on public.reviews as restrictive for select to authenticated using(not public.app_blocked(user_id));
create policy app_connection_block on public.connections as restrictive for select to authenticated using(not public.app_blocked(sender_id) and not public.app_blocked(recipient_id));
create policy app_message_block on public.messages as restrictive for select to authenticated using(not public.app_blocked(sender_id));

-- Private app tables: clients get only the columns/operations they need.
do $$ declare t text; begin
 foreach t in array array['app_blocks','app_moderators','app_suspensions','app_reports','app_moderation_log','app_rate_limits','app_notifications','app_notification_preferences','app_conversation_reads'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
 end loop;
end $$;
grant select on public.app_blocks,public.app_reports,public.app_moderation_log,public.app_notifications,public.app_notification_preferences,public.app_conversation_reads to authenticated;
grant insert,update on public.app_notification_preferences to authenticated;
grant update(read_at) on public.app_notifications to authenticated;
create policy app_blocks_own on public.app_blocks for select to authenticated using(blocker_id=auth.uid());
create policy app_reports_read on public.app_reports for select to authenticated using(public.app_is_moderator());
create policy app_log_read on public.app_moderation_log for select to authenticated using(public.app_is_moderator());
create policy app_notification_read on public.app_notifications for select to authenticated using(user_id=auth.uid() and not public.app_blocked(actor_id));
create policy app_notification_update on public.app_notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy app_preferences_own on public.app_notification_preferences for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy app_reads_own on public.app_conversation_reads for select to authenticated using(user_id=auth.uid());

create function public.app_set_block(target uuid,blocked boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or target=auth.uid() then raise exception 'Invalid account'; end if;
 -- Serialize with new messages and connection requests for this pair.
 perform pg_advisory_xact_lock(hashtextextended(least(auth.uid(),target)::text||greatest(auth.uid(),target)::text,0));
 if blocked then
  perform public.app_take_budget('block',20);
  insert into public.app_blocks(blocker_id,blocked_id) values(auth.uid(),target) on conflict do nothing;
  update public.connections set status='disconnected' where (sender_id=auth.uid() and recipient_id=target) or (sender_id=target and recipient_id=auth.uid());
  update public.conversations c set closed_at=coalesce(closed_at,now()) where exists(select 1 from public.conversation_members m where m.conversation_id=c.id and m.user_id=auth.uid()) and exists(select 1 from public.conversation_members m where m.conversation_id=c.id and m.user_id=target);
  delete from public.app_notifications where (user_id=auth.uid() and actor_id=target) or (user_id=target and actor_id=auth.uid());
 else
  delete from public.app_blocks where blocker_id=auth.uid() and blocked_id=target;
 end if;
end $$;

create function public.app_guard_connection() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status::text in ('pending','accepted') then
  if auth.uid() is null or auth.uid() not in (new.sender_id,new.recipient_id) or not public.app_is_active() then raise exception 'Connection unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(least(new.sender_id,new.recipient_id)::text||greatest(new.sender_id,new.recipient_id)::text,0));
  if public.app_blocked(case when new.sender_id=auth.uid() then new.recipient_id else new.sender_id end) then raise exception 'Connection unavailable'; end if;
  if exists(select 1 from public.app_suspensions where user_id in (new.sender_id,new.recipient_id)) then raise exception 'Connection unavailable'; end if;
  if tg_op='INSERT' then perform public.app_take_budget('connection',10); end if;
 end if;
 return new;
end $$;
create trigger app_connection_guard before insert or update on public.connections for each row execute function public.app_guard_connection();

create function public.app_guard_message() returns trigger language plpgsql security definer set search_path='' as $$
declare peer uuid; closed timestamptz;
begin
 if auth.uid() is null or new.sender_id<>auth.uid() or not public.app_is_active() then raise exception 'Sign in required'; end if;
 if length(trim(new.body)) not between 1 and 3000 then raise exception 'Write a message of 1–3,000 characters'; end if;
 if not exists(select 1 from public.conversation_members where conversation_id=new.conversation_id and user_id=auth.uid()) then raise exception 'Conversation unavailable'; end if;
 select user_id into peer from public.conversation_members where conversation_id=new.conversation_id and user_id<>auth.uid() limit 1;
 if peer is null then raise exception 'Conversation unavailable'; end if;
 perform pg_advisory_xact_lock(hashtextextended(least(auth.uid(),peer)::text||greatest(auth.uid(),peer)::text,0));
 select closed_at into closed from public.conversations where id=new.conversation_id for share;
 if not found or closed is not null or public.app_blocked(peer) or exists(select 1 from public.app_suspensions where user_id=peer) then raise exception 'This conversation is closed'; end if;
 if not exists(select 1 from public.connections where status='accepted' and ((sender_id=auth.uid() and recipient_id=peer) or (sender_id=peer and recipient_id=auth.uid()))) then raise exception 'Connect before messaging'; end if;
 if tg_op='UPDATE' and (new.sender_id<>old.sender_id or new.conversation_id<>old.conversation_id or new.client_key is distinct from old.client_key or new.created_at<>old.created_at) then raise exception 'Message identity cannot change'; end if;
 perform public.app_take_budget('message',30);
 return new;
end $$;
create trigger app_message_guard before insert or update on public.messages for each row execute function public.app_guard_message();

create function public.app_send_message(target uuid,content text,retry_key text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not public.app_is_active() or retry_key is null or length(retry_key) not between 8 and 100 then raise exception 'Invalid message request'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||retry_key,1));
 select id into result from public.messages where sender_id=auth.uid() and client_key=retry_key and conversation_id=target and body=trim(content);
 if result is not null then return result; end if;
 insert into public.messages(sender_id,conversation_id,body,client_key) values(auth.uid(),target,trim(content),retry_key) returning id into result;
 return result;
end $$;
create function public.app_mark_conversation_read(target uuid,through_message uuid) returns void language plpgsql security definer set search_path='' as $$
declare stamp timestamptz;
begin
 if not exists(select 1 from public.conversation_members where conversation_id=target and user_id=auth.uid()) then raise exception 'Conversation unavailable'; end if;
 select created_at into stamp from public.messages where id=through_message and conversation_id=target and not public.app_blocked(sender_id);
 if stamp is null then return; end if;
 insert into public.app_conversation_reads values(auth.uid(),target,stamp) on conflict(user_id,conversation_id) do update set read_at=greatest(app_conversation_reads.read_at,excluded.read_at);
 update public.app_notifications set read_at=now() where user_id=auth.uid() and kind='message' and target_id=target and created_at<=stamp;
end $$;

create function public.app_notify(recipient uuid,actor uuid,event_kind text,target uuid,event_id text) returns void language plpgsql security definer set search_path='' as $$
begin
 if recipient=actor or exists(select 1 from public.app_blocks where (blocker_id=recipient and blocked_id=actor) or (blocker_id=actor and blocked_id=recipient)) then return; end if;
 if exists(select 1 from public.app_notification_preferences where user_id=recipient and ((event_kind='message' and not messages) or (event_kind like 'connection%' and not connections) or (event_kind like 'meetup%' and not meetups))) then return; end if;
 insert into public.app_notifications(user_id,actor_id,kind,target_id,event_key) values(recipient,actor,event_kind,target,event_id) on conflict do nothing;
end $$;
create function public.app_social_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare member uuid;
begin
 if tg_table_name='messages' then
  for member in select user_id from public.conversation_members where conversation_id=new.conversation_id and user_id<>new.sender_id loop
   perform public.app_notify(member,new.sender_id,'message',new.conversation_id,'message:'||new.id);
  end loop;
 elsif new.status::text='pending' and (tg_op='INSERT' or old.status::text<>'pending') then
  perform public.app_notify(new.recipient_id,new.sender_id,'connection_request',new.id,'request:'||new.id||':'||clock_timestamp());
 elsif tg_op='UPDATE' and new.status::text='accepted' and old.status::text<>'accepted' then
  perform public.app_notify(new.sender_id,new.recipient_id,'connection_accepted',new.id,'accepted:'||new.id||':'||clock_timestamp());
 end if;
 return new;
end $$;
create trigger app_message_notification after insert on public.messages for each row execute function public.app_social_notification();
create trigger app_connection_notification after insert or update on public.connections for each row execute function public.app_social_notification();

create function public.app_finish_onboarding(display_name text,biography text,location uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or exists(select 1 from public.app_suspensions where user_id=auth.uid()) then raise exception 'Account unavailable'; end if;
 if length(trim(display_name)) not between 1 and 100 or length(biography)>1000 then raise exception 'Check your name and bio'; end if;
 if location is not null and not public.maps_can_read_city(location) then raise exception 'City unavailable'; end if;
 insert into public.profiles(id,full_name,bio,home_city,home_city_id,onboarding_completed_at)
 values(auth.uid(),trim(display_name),trim(biography),coalesce((select name from public.cities where id=location),''),location,now())
 on conflict(id) do update set full_name=excluded.full_name,bio=excluded.bio,home_city=excluded.home_city,home_city_id=excluded.home_city_id,onboarding_completed_at=now();
end $$;

create function public.app_manage_community(target uuid,operation text,member uuid default null,value text default '',description text default '') returns void language plpgsql security definer set search_path='' as $$
declare owner uuid; is_manager boolean;
begin
 if not public.app_is_active() then raise exception 'Account unavailable'; end if;
 select owner_id into owner from public.communities where id=target for update;
 is_manager:=owner=auth.uid() or exists(select 1 from public.memberships where community_id=target and user_id=auth.uid() and role='moderator');
 if owner is null or not coalesce(is_manager,false) then raise exception 'Community unavailable'; end if;
 if operation='edit' then
  if length(trim(value)) not between 1 and 100 or length(description)>2000 then raise exception 'Check community name and description'; end if;
  update public.communities set name=trim(value),description=trim(app_manage_community.description) where id=target;
 elsif operation='delete' and owner=auth.uid() then
  delete from public.communities where id=target;
 elsif operation='role' and owner=auth.uid() and member<>owner and value in ('member','moderator') then
  if value='moderator' then update public.memberships set role='moderator' where community_id=target and user_id=member;
  else update public.memberships set role='member' where community_id=target and user_id=member; end if;
  if not found then raise exception 'Member unavailable'; end if;
 elsif operation='remove' and member<>owner and member<>auth.uid() then
  if owner<>auth.uid() and exists(select 1 from public.memberships where community_id=target and user_id=member and role='moderator') then raise exception 'Only the owner can remove moderators'; end if;
  delete from public.memberships where community_id=target and user_id=member;
  if not found then raise exception 'Member unavailable'; end if;
 else raise exception 'Action not permitted'; end if;
end $$;

-- A versioned meetup model avoids guessing the columns of any legacy meetup tables.
create table public.app_meetups(
 id uuid primary key default gen_random_uuid(), community_id uuid not null references public.communities(id) on delete cascade,
 host_id uuid not null references public.profiles(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 120), description text not null default '' check(length(description)<=3000),
 venue text not null check(length(trim(venue)) between 1 and 300), starts_at timestamptz not null, ends_at timestamptz not null,
 timezone text not null, capacity integer not null check(capacity between 1 and 500), cancelled_at timestamptz,
 created_at timestamptz not null default now(),check(ends_at>starts_at)
);
create table public.app_meetup_rsvps(
 meetup_id uuid references public.app_meetups(id) on delete cascade,user_id uuid references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),primary key(meetup_id,user_id)
);
alter table public.app_meetups enable row level security;
alter table public.app_meetup_rsvps enable row level security;
revoke all on public.app_meetups,public.app_meetup_rsvps from public,anon,authenticated;
grant select on public.app_meetups,public.app_meetup_rsvps to authenticated;
create policy app_meetups_visible on public.app_meetups for select to authenticated using(public.is_member(community_id) and not public.app_blocked(host_id));
create policy app_rsvps_visible on public.app_meetup_rsvps for select to authenticated using(exists(select 1 from public.app_meetups where id=meetup_id));
create function public.app_save_meetup(target uuid,group_id uuid,title text,description text,venue text,starts timestamptz,ends timestamptz,zone text,capacity integer) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; attendee uuid;
begin
 perform public.app_take_budget('meetup',10);
 if not public.is_member(group_id) then raise exception 'Join this community first'; end if;
 if starts<=now() or ends<=starts or not exists(select 1 from pg_timezone_names where name=zone) then raise exception 'Choose a future time and a valid timezone'; end if;
 if target is null then
  insert into public.app_meetups(community_id,host_id,title,description,venue,starts_at,ends_at,timezone,capacity)
  values(group_id,auth.uid(),trim(title),trim(description),trim(venue),starts,ends,zone,capacity) returning id into result;
 else
  perform 1 from public.app_meetups where id=target and host_id=auth.uid() and community_id=group_id and cancelled_at is null for update;
  if not found then raise exception 'Meetup unavailable'; end if;
  if capacity<(select count(*) from public.app_meetup_rsvps where meetup_id=target) then raise exception 'Capacity cannot be below attendance'; end if;
  update public.app_meetups set title=trim(app_save_meetup.title),description=trim(app_save_meetup.description),venue=trim(app_save_meetup.venue),starts_at=starts,ends_at=ends,timezone=zone,capacity=app_save_meetup.capacity where id=target;
  result:=target;
  for attendee in select user_id from public.app_meetup_rsvps where meetup_id=target loop
   perform public.app_notify(attendee,auth.uid(),'meetup_updated',target,'meetup:'||target||':'||clock_timestamp());
  end loop;
 end if;
 return result;
end $$;
create function public.app_rsvp(target uuid,attending boolean) returns void language plpgsql security definer set search_path='' as $$
declare event public.app_meetups;
begin
 perform public.app_take_budget('rsvp',20);
 select * into event from public.app_meetups where id=target for update;
 if not found or not public.is_member(event.community_id) or public.app_blocked(event.host_id) then raise exception 'Meetup unavailable'; end if;
 if not attending then delete from public.app_meetup_rsvps where meetup_id=target and user_id=auth.uid(); return; end if;
 if event.cancelled_at is not null or event.starts_at<=now() then raise exception 'This meetup is no longer accepting RSVPs'; end if;
 if exists(select 1 from public.app_meetup_rsvps where meetup_id=target and user_id=auth.uid()) then return; end if;
 if (select count(*) from public.app_meetup_rsvps where meetup_id=target)>=event.capacity then raise exception 'This meetup is full'; end if;
 insert into public.app_meetup_rsvps(meetup_id,user_id) values(target,auth.uid());
end $$;
create function public.app_cancel_meetup(target uuid) returns void language plpgsql security definer set search_path='' as $$
declare attendee uuid;
begin
 if not public.app_is_active() then raise exception 'Account unavailable'; end if;
 update public.app_meetups set cancelled_at=now() where id=target and host_id=auth.uid() and cancelled_at is null;
 if not found then raise exception 'Meetup unavailable'; end if;
 for attendee in select user_id from public.app_meetup_rsvps where meetup_id=target loop
  perform public.app_notify(attendee,auth.uid(),'meetup_cancelled',target,'cancelled:'||target);
 end loop;
end $$;
create function public.app_membership_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
declare cancelled uuid; attendee uuid;
begin
 delete from public.check_in_shares s using public.check_ins t where s.check_in_id=t.id and s.community_id=old.community_id and t.user_id=old.user_id;
 delete from public.app_meetup_rsvps r using public.app_meetups m where r.meetup_id=m.id and m.community_id=old.community_id and r.user_id=old.user_id;
 for cancelled in update public.app_meetups set cancelled_at=now() where community_id=old.community_id and host_id=old.user_id and starts_at>now() and cancelled_at is null returning id loop
  for attendee in select user_id from public.app_meetup_rsvps where meetup_id=cancelled loop
   perform public.app_notify(attendee,old.user_id,'meetup_cancelled',cancelled,'host-left:'||cancelled);
  end loop;
 end loop;
 return old;
end $$;
create trigger app_member_left after delete on public.memberships for each row execute function public.app_membership_cleanup();

-- Invoker reads respect the original target RLS; insert is through a non-public helper.
create function public.app_store_report(kind text,target uuid,reason text,evidence jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform public.app_take_budget('report',5);
 insert into public.app_reports(reporter_id,target_type,target_id,reason,evidence) values(auth.uid(),kind,target,trim(reason),evidence) returning id into result;
 return result;
end $$;
-- Security definer uses explicit target visibility, never a caller-provided evidence snapshot.
create function public.app_report(kind text,target uuid,reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare evidence jsonb;
begin
 if not public.app_is_active() then raise exception 'Account unavailable'; end if;
 if kind='profile' then
  select jsonb_build_object('name',p.full_name,'bio',p.bio) into evidence from public.profiles p where p.id=target and p.id<>auth.uid() and not public.app_blocked(p.id) and (
   exists(select 1 from public.memberships a join public.memberships b using(community_id) where a.user_id=auth.uid() and b.user_id=p.id)
   or exists(select 1 from public.connections c where c.status='accepted' and ((c.sender_id=auth.uid() and c.recipient_id=p.id) or (c.recipient_id=auth.uid() and c.sender_id=p.id))));
 elsif kind='message' then
  select jsonb_build_object('body',m.body,'author',m.sender_id) into evidence from public.messages m where m.id=target and exists(select 1 from public.conversation_members where conversation_id=m.conversation_id and user_id=auth.uid());
 elsif kind='review' then
  select jsonb_build_object('body',r.body,'author',r.user_id) into evidence from public.reviews r where r.id=target and public.is_member(r.community_id);
 elsif kind='community' then
  select jsonb_build_object('name',c.name,'description',c.description,'author',c.owner_id) into evidence from public.communities c where c.id=target and public.is_member(c.id);
 elsif kind='meetup' then
  select jsonb_build_object('title',m.title,'description',m.description,'author',m.host_id) into evidence from public.app_meetups m where m.id=target and public.is_member(m.community_id);
 end if;
 if evidence is null then raise exception 'Content unavailable'; end if;
 return public.app_store_report(kind,target,reason,evidence);
end $$;
create function public.app_resolve_report(target uuid,decision text,note text) returns void language plpgsql security definer set search_path='' as $$
declare report public.app_reports; author uuid;
begin
 if not public.app_is_moderator() then raise exception 'Moderator access required'; end if;
 if length(trim(note)) not between 3 and 2000 then raise exception 'Explain this decision'; end if;
 select * into report from public.app_reports where id=target for update;
 if not found then raise exception 'Report unavailable'; end if;
 author:=case when report.target_type='profile' then report.target_id else (report.evidence->>'author')::uuid end;
 if decision='suspend' then
  if author is null or author=auth.uid() then raise exception 'Cannot suspend this account'; end if;
  insert into public.app_suspensions(user_id,reason) values(author,note) on conflict(user_id) do update set reason=excluded.reason;
 elsif decision='remove' then
  if report.target_type='message' then delete from public.messages where id=report.target_id;
  elsif report.target_type='review' then delete from public.reviews where id=report.target_id;
  elsif report.target_type='meetup' then update public.app_meetups set cancelled_at=now() where id=report.target_id;
  else raise exception 'Use account suspension for this content'; end if;
 elsif decision not in ('reviewing','resolved','dismissed') then raise exception 'Invalid decision'; end if;
 update public.app_reports set status=case when decision in ('remove','suspend') then 'resolved' else decision end,resolution=note where id=target;
 insert into public.app_moderation_log(moderator_id,report_id,action,note) values(auth.uid(),target,decision,note);
end $$;

create function public.app_conversations() returns table(id uuid,closed_at timestamptz,name text,peer uuid,preview text,updated timestamptz,unread bigint)
language sql stable security definer set search_path='' as $$
 select c.id,c.closed_at,coalesce(p.full_name,'Former member'),p.id,coalesce(last_message.body,''),coalesce(last_message.created_at,c.created_at),
 (select count(*) from public.messages m where m.conversation_id=c.id and m.sender_id<>auth.uid() and not public.app_blocked(m.sender_id) and m.created_at>coalesce(r.read_at,'-infinity'::timestamptz))
 from public.conversations c
 join public.conversation_members mine on mine.conversation_id=c.id and mine.user_id=auth.uid()
 left join lateral(select other.user_id from public.conversation_members other where other.conversation_id=c.id and other.user_id<>auth.uid() limit 1) person on true
 left join public.profiles p on p.id=person.user_id
 left join public.app_conversation_reads r on r.conversation_id=c.id and r.user_id=auth.uid()
 left join lateral(select m.body,m.created_at from public.messages m where m.conversation_id=c.id and not public.app_blocked(m.sender_id) order by m.created_at desc,m.id desc limit 1) last_message on true
 where public.app_is_active() and not public.app_blocked(person.user_id)
 order by coalesce(last_message.created_at,c.created_at) desc,c.id;
$$;
-- Triggers also protect writes through older SECURITY DEFINER RPCs.
create function public.app_require_active_write() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null then
  if not public.app_is_active() then raise exception 'Account unavailable'; end if;
  if tg_op='INSERT' and tg_table_name in ('reviews','invites','communities') then perform public.app_take_budget(tg_table_name,10); end if;
 end if;
 return new;
end $$;
do $$ declare t text; begin
 foreach t in array array['check_ins','reviews','saved_places','communities','memberships','invites'] loop
  execute format('create trigger app_require_active before insert or update on public.%I for each row execute function public.app_require_active_write()',t);
 end loop;
end $$;

-- Operator-managed literal phrase rules supplement reports and rate limits.
create table public.app_content_rules(phrase text primary key check(length(trim(phrase)) between 3 and 100),created_at timestamptz not null default now());
alter table public.app_content_rules enable row level security;
revoke all on public.app_content_rules from public,anon,authenticated;
grant select on public.app_content_rules to authenticated;
create policy app_rules_moderator on public.app_content_rules for select to authenticated using(public.app_is_moderator());
create function public.app_set_content_rule(phrase text,enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.app_is_moderator() then raise exception 'Moderator access required'; end if;
 if enabled then insert into public.app_content_rules(phrase) values(lower(trim(phrase))) on conflict do nothing;
 else delete from public.app_content_rules where app_content_rules.phrase=lower(trim(app_set_content_rule.phrase)); end if;
 insert into public.app_moderation_log(moderator_id,action,note) values(auth.uid(),case when enabled then 'add_filter' else 'remove_filter' end,lower(trim(phrase)));
end $$;
create function public.app_filter_content() returns trigger language plpgsql security definer set search_path='' as $$
declare document jsonb:=to_jsonb(new); content text;
begin
 if tg_op='UPDATE' and not exists(select 1 from unnest(array['body','title','description','full_name','bio','name','venue']) field where to_jsonb(new)->field is distinct from to_jsonb(old)->field) then return new; end if;
 content:=lower(concat_ws(' ',document->>'body',document->>'title',document->>'description',document->>'full_name',document->>'bio',document->>'name',document->>'venue'));
 if exists(select 1 from public.app_content_rules r where strpos(content,r.phrase)>0) then raise exception 'Please revise this content to follow the community guidelines.'; end if;
 return new;
end $$;
do $$ declare t text; begin
 foreach t in array array['profiles','communities','messages','reviews','app_meetups'] loop
  execute format('create trigger app_content_filter before insert or update on public.%I for each row execute function public.app_filter_content()',t);
 end loop;
end $$;

-- All helpers are private by default. Only the explicit application API is exposed.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'app\_%' escape '\' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 end loop;
end $$;
grant execute on function public.app_set_content_rule(text,boolean),public.app_conversations(),public.app_is_moderator(),public.app_is_active(),public.app_blocked(uuid),public.app_set_block(uuid,boolean),
 public.app_send_message(uuid,text,text),public.app_mark_conversation_read(uuid,uuid),public.app_finish_onboarding(text,text,uuid),
 public.app_manage_community(uuid,text,uuid,text,text),public.app_save_meetup(uuid,uuid,text,text,text,timestamptz,timestamptz,text,integer),
 public.app_rsvp(uuid,boolean),public.app_cancel_meetup(uuid),public.app_report(text,uuid,text),public.app_resolve_report(uuid,text,text) to authenticated;
-- Existing projects may not have Realtime enabled. Polling remains a client fallback.
do $$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['messages','connections','app_notifications'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
    execute format('alter publication supabase_realtime add table public.%I',t);
   end if;
  end loop;
 end if;
end $$;
commit;
