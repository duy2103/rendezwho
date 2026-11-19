begin;
create table public.app_push_devices(token text primary key,user_id uuid not null references public.profiles(id) on delete cascade,updated_at timestamptz not null default now());
create table public.app_push_deliveries(
 id uuid primary key default gen_random_uuid(),notification_id uuid not null references public.app_notifications(id) on delete cascade,
 token text not null references public.app_push_devices(token) on delete cascade, attempts integer not null default 0,
 claimed_at timestamptz,ticket text,finished_at timestamptz,last_error text,unique(notification_id,token)
);
alter table public.app_push_devices enable row level security;
alter table public.app_push_deliveries enable row level security;
revoke all on public.app_push_devices,public.app_push_deliveries from public,anon,authenticated;
grant select,update,delete on public.app_push_deliveries to service_role;
grant select,delete on public.app_push_devices to service_role;
create function public.app_register_push(device_token text,enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or (enabled and not public.app_is_active()) then raise exception 'Account unavailable'; end if;
 if device_token is null or device_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$' then raise exception 'Invalid device token'; end if;
 perform pg_advisory_xact_lock(hashtextextended(device_token,2));
 if enabled then
  -- A device moving to another account must never inherit the old account's pending pushes.
  delete from public.app_push_devices where token=device_token and user_id<>auth.uid();
  insert into public.app_push_devices(token,user_id) values(device_token,auth.uid()) on conflict(token) do update set updated_at=now();
 else delete from public.app_push_devices where token=device_token and user_id=auth.uid(); end if;
end $$;
revoke all on function public.app_register_push(text,boolean) from public,anon;
grant execute on function public.app_register_push(text,boolean) to authenticated;
create function public.app_claim_push() returns table(delivery_id uuid,token text,notification_id uuid,user_id uuid,kind text,target_id uuid)
language plpgsql security definer set search_path='' as $$
begin
 insert into public.app_push_deliveries(notification_id,token)
 select n.id,d.token from public.app_notifications n join public.app_push_devices d on d.user_id=n.user_id
 where n.read_at is null and n.created_at>now()-interval '1 day' and n.created_at>=d.updated_at
 on conflict do nothing;
 -- Recheck access at delivery time, not just when the notification was produced.
 return query
 with eligible as (
 select x.id from public.app_push_deliveries x join public.app_notifications n on n.id=x.notification_id
 join public.app_push_devices d on d.token=x.token and d.user_id=n.user_id
 left join public.app_notification_preferences p on p.user_id=n.user_id
 where x.finished_at is null and x.ticket is null and x.attempts<3 and (x.claimed_at is null or x.claimed_at<now()-interval '5 minutes')
 and n.read_at is null and n.created_at>now()-interval '1 day'
 and not exists(select 1 from public.app_suspensions s where s.user_id in (n.user_id,n.actor_id))
 and not exists(select 1 from public.app_blocks b where (b.blocker_id=n.user_id and b.blocked_id=n.actor_id) or (b.blocker_id=n.actor_id and b.blocked_id=n.user_id))
 and case when n.kind='message' then coalesce(p.messages,true) and exists(select 1 from public.conversation_members m join public.conversations c on c.id=m.conversation_id where m.conversation_id=n.target_id and m.user_id=n.user_id and c.closed_at is null)
 when n.kind like 'connection%' then coalesce(p.connections,true) and exists(select 1 from public.connections c where c.id=n.target_id and c.status::text in ('pending','accepted'))
 when n.kind like 'meetup%' then coalesce(p.meetups,true) and exists(select 1 from public.app_meetups m join public.memberships mm on mm.community_id=m.community_id where m.id=n.target_id and mm.user_id=n.user_id)
 else false end
 order by n.created_at limit 100 for update of x skip locked
 ), claimed as(update public.app_push_deliveries x set claimed_at=now(),attempts=attempts+1 from eligible e where x.id=e.id returning x.*)
 select x.id,x.token,n.id,n.user_id,n.kind,n.target_id from claimed x join public.app_notifications n on n.id=x.notification_id;
end $$;
revoke all on function public.app_claim_push() from public,anon,authenticated;
grant execute on function public.app_claim_push() to service_role;
commit;
