import { database } from './supabase';
export type Meetup = {
  id: string;
  community_id: string;
  host_id: string;
  title: string;
  description: string;
  venue: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  capacity: number;
  cancelled_at: string | null;
  rsvps: { user_id: string }[];
};
export async function listMeetups(community?: string, limit = 50) {
  const request = database()
    .from('app_meetups')
    .select(
      'id,community_id,host_id,title,description,venue,starts_at,ends_at,timezone,capacity,cancelled_at,rsvps:app_meetup_rsvps(user_id)',
    )
    .gte('ends_at', new Date().toISOString())
    .order('starts_at')
    .order('id')
    .limit(limit);
  if (community) request.eq('community_id', community);
  const { data, error } = await request;
  if (error) throw error;
  return data as Meetup[];
}
export function parseMeetupTime(value: string) {
  // Require an offset: a device timezone must never silently shift an event.
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new Error('Use a date, time and UTC offset, for example 2027-01-15T18:00+01:00.');
  const [date] = value.split('T');
  const [year, month, day] = date.split('-').map(Number);
  if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== date)
    throw new Error('Enter a valid calendar date.');
  return new Date(value).toISOString();
}
export async function saveMeetup(values: {
  target: string | null;
  group_id: string;
  title: string;
  description: string;
  venue: string;
  starts: string;
  ends: string;
  zone: string;
  capacity: number;
}) {
  const starts = parseMeetupTime(values.starts);
  const ends = parseMeetupTime(values.ends);
  if (starts >= ends || Date.parse(starts) <= Date.now())
    throw new Error('Choose a future start and a later end.');
  if (!Number.isInteger(values.capacity) || values.capacity < 1 || values.capacity > 500)
    throw new Error('Capacity must be 1–500.');
  try {
    new Intl.DateTimeFormat('en', { timeZone: values.zone }).format();
  } catch {
    throw new Error('Enter a timezone such as Europe/Berlin.');
  }
  const { error } = await database().rpc('app_save_meetup', { ...values, starts, ends });
  if (error) throw error;
}
export async function rsvp(target: string, attending: boolean) {
  const { error } = await database().rpc('app_rsvp', { target, attending });
  if (error) throw error;
}
export async function cancelMeetup(target: string) {
  const { error } = await database().rpc('app_cancel_meetup', { target });
  if (error) throw error;
}
