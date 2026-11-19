import { invitationToken } from './invites';
import type { Coordinates } from './mapData';
import { localDate } from './travel';
import { validateDates } from './validation';
import { database } from './supabase';
// Fetch bounded pages with deterministic ordering; do not silently lose older rows.
async function collectRows<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const data: T[] = [];
  for (let offset = 0; ; offset += 250) {
    const result = await page(offset, offset + 249);
    if (result.error) throw result.error;
    data.push(...(result.data ?? []));
    if (!result.data || result.data.length < 250) return { data, error: null };
  }
}
export type Profile = {
  id: string;
  full_name: string;
  home_city: string;
  home_city_id: string | null;
  bio: string;
};
export type City = Coordinates & {
  id: string;
  name: string;
  country_code: string | null;
  region: string;
};
export type Trip = {
  id: string;
  user_id: string;
  city_id: string;
  city: string;
  arrival: string;
  departure: string;
  note: string;
  group_ids: string[];
};
export type Place = Coordinates & {
  id: string;
  city_id: string;
  name: string;
  address: string;
  category: string | null;
};
export type SavedPlace = {
  id: string;
  user_id: string;
  city: string;
  city_id: string;
  place_id: string;
  name: string;
  note: string;
  status: 'want_to_go' | 'visited';
  visited_at: string | null;
  place: Place | null;
};
export type Community = { id: string; owner_id: string; name: string; description: string };
export type Message = {
  id: string;
  sender_id: string;
  conversation_id: string;
  body: string;
  created_at: string;
};
export type Conversation = { id: string; created_at: string; closed_at: string | null };

export async function getProfile(userId: string) {
  const { data, error } = await database()
    .from('profiles')
    .select('id,full_name,home_city,home_city_id,bio')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}
export async function saveProfile(
  userId: string,
  fullName: string,
  bio: string,
  city: City | null,
) {
  if (!fullName.trim() || fullName.trim().length > 100)
    throw new Error('Your name must contain 1–100 characters.');
  const { data, error } = await database()
    .from('profiles')
    .update({
      full_name: fullName.trim(),
      bio: bio.trim(),
      home_city: city?.name ?? '',
      home_city_id: city?.id || null,
    })
    .eq('id', userId)
    .select('id')
    .single();
  if (error) throw error;
  if (!data) throw new Error('Your profile is unavailable. Please contact support.');
}
export async function searchCities(term: string) {
  const { data, error } = await database()
    .from('cities')
    .select('id,name,country_code,region,latitude,longitude')
    .ilike('name', `%${term.replace(/[%_]/g, '')}%`)
    .order('name')
    .limit(20);
  if (error) throw error;
  return data as City[];
}
export async function listTrips(userId: string) {
  const { data, error } = await collectRows((from, to) =>
    database()
      .from('check_ins')
      .select('id,user_id,city_id,city,arrival,departure,note')
      .eq('user_id', userId)
      .order('arrival', { ascending: false })
      .order('id')
      .range(from, to),
  );
  if (error) throw error;
  if (!data?.length) return [];
  const { data: shares, error: shareError } = await database()
    .from('check_in_shares')
    .select('check_in_id,community_id')
    .in(
      'check_in_id',
      data.map((t) => t.id),
    );
  if (shareError) throw shareError;
  return data.map((t) => ({
    ...t,
    group_ids: (shares ?? [])
      .filter((s) => s.check_in_id === t.id)
      .map((s) => s.community_id as string),
  })) as Trip[];
}
export async function saveTrip(
  userId: string,
  city: City,
  arrival: string,
  departure: string,
  note: string,
  id?: string,
  groupIds: string[] = [],
) {
  validateDates(arrival, departure);
  if (!userId) throw new Error('Sign in required.');
  if (!city.id) throw new Error('Select a city before saving.');
  const { data, error } = await database().rpc('maps_save_checkin', {
    checkin_id: id ?? null,
    location: city.id,
    arrival_date: arrival,
    departure_date: departure,
    trip_note: note.trim(),
    groups: [...new Set(groupIds)],
  });
  if (error) throw error;
  if (!data) throw new Error('The trip was not saved. Please refresh and try again.');
}
export async function deleteOwned(table: 'check_ins' | 'saved_places', id: string, userId: string) {
  const { data, error } = await database()
    .from(table)
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('Nothing was deleted. Refresh and check your access.');
}
export async function listSaved(userId: string, limit = 50) {
  const { data, error } = await database()
    .from('saved_places')
    .select(
      'id,user_id,city,city_id,place_id,name,note,status,visited_at,place:places!saved_places_place_id_fkey(id,city_id,name,address,category,latitude,longitude)',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id')
    .limit(limit);
  if (error) throw error;
  return data as unknown as SavedPlace[];
}
export async function searchPlaces(cityId: string, term: string) {
  const { data, error } = await database()
    .from('places')
    .select('id,city_id,name,address,category,latitude,longitude')
    .eq('city_id', cityId)
    .ilike('name', `%${term.replace(/[%_]/g, '')}%`)
    .order('name')
    .limit(20);
  if (error) throw error;
  return data as Place[];
}
export async function savePlace(userId: string, city: City, place: Place, note: string) {
  if (!userId || !city.id || city.id !== place.city_id)
    throw new Error('Choose a place in the selected city.');
  const { data, error } = await database().rpc('maps_save_place', {
    location: city.id,
    place_name: place.name,
    place_note: note.trim(),
    existing_place: place.id || null,
    lat: place.latitude ?? null,
    lng: place.longitude ?? null,
  });
  if (error) throw error;
  return data as string;
}
export async function updateSaved(
  id: string,
  userId: string,
  note: string,
  status: SavedPlace['status'],
  visitedAt: string | null,
) {
  const { error } = await database()
    .from('saved_places')
    .update({
      note: note.trim(),
      status,
      visited_at: status === 'visited' ? visitedAt || new Date().toISOString() : null,
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')
    .single();
  if (error) throw error;
}
export async function createCity(name: string) {
  const { data, error } = await database().rpc('maps_save_city', { label: name.trim() });
  if (error) throw error;
  return data as City;
}
export type SearchResult = Place & {
  provider_id: string;
  kind: 'city' | 'place';
  region: string;
  country_code: string | null;
};
export async function searchLocations(kind: 'city' | 'place', query: string, cityId?: string) {
  const { data, error } = await database().functions.invoke('search-locations', {
    body: { kind, query, cityId, language: 'en' },
  });
  if (error) {
    let message = 'External search is unavailable. Try an existing result or a custom place.';
    try {
      const body = await error.context?.json();
      if (body?.error) message = body.error;
    } catch {
      /* Keep fallback. */
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as { cacheId: string; results: SearchResult[] };
}
export async function importLocation(cacheId: string, resultId: string, cityId?: string) {
  const { data, error } = await database().rpc('maps_import_result', {
    cache_id: cacheId,
    result_id: resultId,
    location: cityId ?? null,
  });
  if (error) throw error;
  return data as City & Place;
}
export type Review = {
  id: string;
  user_id: string;
  community_id: string;
  rating: number;
  body: string;
  created_at: string;
};
export async function listReviews(placeId: string) {
  const { data, error } = await database()
    .from('reviews')
    .select('id,user_id,community_id,rating,body,created_at')
    .eq('place_id', placeId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data as Review[];
}
export async function saveReview(
  userId: string,
  city: City,
  place: Place,
  communityId: string,
  rating: number,
  body: string,
  reviewId?: string,
) {
  if (
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5 ||
    !body.trim() ||
    body.trim().length > 3000
  )
    throw new Error('Enter a rating of 1–5 and a review of 1–3,000 characters.');
  const values = {
    user_id: userId,
    city_id: city.id,
    city: city.name,
    place_id: place.id,
    place: place.name,
    community_id: communityId,
    rating,
    body: body.trim(),
  };
  const request = reviewId
    ? database().from('reviews').update(values).eq('id', reviewId).eq('user_id', userId)
    : database().from('reviews').insert(values);
  const { error } = await request.select('id').single();
  if (error) throw error;
}
export async function deleteReview(id: string, userId: string) {
  const { error } = await database()
    .from('reviews')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')
    .single();
  if (error) throw error;
}
export async function listCommunities(userId: string) {
  const { data: memberships, error: membershipError } = await database()
    .from('memberships')
    .select('community_id')
    .eq('user_id', userId);
  if (membershipError) throw membershipError;
  const { data: owned, error: ownerError } = await database()
    .from('communities')
    .select('id,owner_id,name,description')
    .eq('owner_id', userId);
  if (ownerError) throw ownerError;
  const ids = (memberships ?? []).map((m) => m.community_id as string);
  if (!ids.length) return owned as Community[];
  const { data, error } = await database()
    .from('communities')
    .select('id,owner_id,name,description')
    .in('id', ids)
    .order('name');
  if (error) throw error;
  return [
    ...new Map([...(owned ?? []), ...(data ?? [])].map((c) => [c.id, c])).values(),
  ] as Community[];
}
export async function listConversations(userId: string) {
  const { data: members, error: memberError } = await database()
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', userId);
  if (memberError) throw memberError;
  if (!members?.length) return [];
  const { data, error } = await database()
    .from('conversations')
    .select('id,created_at,closed_at')
    .in(
      'id',
      members.map((m) => m.conversation_id),
    )
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data as Conversation[];
}
export async function listMessages(conversationId: string) {
  const { data, error } = await database()
    .from('messages')
    .select('id,sender_id,conversation_id,body,created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data as Message[]).reverse();
}
export async function sendMessage(userId: string, conversationId: string, body: string) {
  if (!body.trim() || body.trim().length > 3000)
    throw new Error('Write a message of 1–3,000 characters.');
  const { error } = await database()
    .from('messages')
    .insert({ sender_id: userId, conversation_id: conversationId, body: body.trim() });
  if (error) throw error;
}

export async function createCommunity(name: string, description: string) {
  if (!name.trim()) throw new Error('Enter a community name.');
  const { data, error } = await database().rpc('create_community', {
    group_name: name.trim(),
    group_description: description.trim(),
  });
  if (error) throw error;
  return data as string;
}
export async function joinCommunity(token: string) {
  const code = invitationToken(token);
  const { data, error } = await database().rpc('join_community', { invite_token: code });
  if (error) throw error;
  return data as string;
}
export type Invite = {
  id: string;
  token: string;
  expires_at: string | null;
  revoked_at: string | null;
  use_count: number;
  max_uses: number | null;
};
export async function listInvites(groupId: string) {
  const { data, error } = await collectRows((from, to) =>
    database()
      .from('invites')
      .select('id,token,expires_at,revoked_at,use_count,max_uses')
      .eq('community_id', groupId)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to),
  );
  if (error) throw error;
  return data as Invite[];
}
export async function createInvite(groupId: string) {
  const { data, error } = await database().rpc('create_invite', {
    group_id: groupId,
    expires: new Date(Date.now() + 7 * 86400000).toISOString(),
    uses: null,
    recipient: null,
  });
  if (error) throw error;
  return data as string;
}
export async function revokeInvite(inviteId: string) {
  const { error } = await database().rpc('revoke_invite', { invite_id: inviteId });
  if (error) throw error;
}
export async function leaveCommunity(groupId: string) {
  const { error } = await database().rpc('leave_community', {
    group_id: groupId,
    remove_contributions: false,
  });
  if (error) throw error;
}
export async function deleteMyAccount() {
  // Never silently delete communities owned by this account. The backend requires
  // ownership transfer first; expose community deletion separately if desired.
  const { error } = await database().rpc('delete_my_account', { delete_owned_communities: false });
  if (error) throw error;
  await database().auth.signOut({ scope: 'local' });
}

export type Member = { user_id: string; role: 'member' | 'moderator'; full_name: string };
export async function listMembers(groupId: string) {
  const { data, error } = await collectRows((from, to) =>
    database()
      .from('memberships')
      .select('user_id,role')
      .eq('community_id', groupId)
      .order('joined_at')
      .order('user_id')
      .range(from, to),
  );
  if (error) throw error;
  if (!data?.length) return [];
  const { data: profiles, error: profileError } = await database()
    .from('profiles')
    .select('id,full_name')
    .in(
      'id',
      data.map((m) => m.user_id),
    );
  if (profileError) throw profileError;
  return data.map((m) => ({
    ...m,
    full_name: profiles?.find((p) => p.id === m.user_id)?.full_name ?? 'Member',
  })) as Member[];
}
export async function transferCommunity(groupId: string, newOwner: string) {
  const { error } = await database().rpc('transfer_community', {
    group_id: groupId,
    new_owner: newOwner,
  });
  if (error) throw error;
}
export async function requestConnection(recipient: string) {
  const { error } = await database().rpc('request_connection', { recipient });
  if (error) throw error;
}
export type Connection = {
  id: string;
  sender_id: string;
  recipient_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'disconnected';
  name: string;
};
export async function listConnections(userId: string) {
  const { data, error } = await collectRows((from, to) =>
    database()
      .from('connections')
      .select('id,sender_id,recipient_id,status')
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to),
  );
  if (error) throw error;
  if (!data?.length) return [];
  const ids = data.map((c) => (c.sender_id === userId ? c.recipient_id : c.sender_id));
  const { data: profiles, error: profileError } = await database()
    .from('profiles')
    .select('id,full_name')
    .in('id', ids);
  if (profileError) throw profileError;
  return data.map((c) => ({
    ...c,
    name:
      profiles?.find((p) => p.id === (c.sender_id === userId ? c.recipient_id : c.sender_id))
        ?.full_name ?? 'Member',
  })) as Connection[];
}
export async function respondConnection(connection: string, response: 'accepted' | 'declined') {
  const { error } = await database().rpc('respond_connection', { connection, response });
  if (error) throw error;
}
export async function disconnectConnection(connection: string) {
  const { error } = await database().rpc('disconnect', { connection });
  if (error) throw error;
}

export type NetworkTrip = Omit<Trip, 'group_ids'> & { full_name: string; location: City | null };
/** RLS determines visibility; never request precise coordinates or bypass shares. */
export async function listNetworkTrips(
  userId: string,
  fromDate = localDate(),
  throughDate?: string,
) {
  const request = database()
    .from('check_ins')
    .select(
      'id,user_id,city_id,city,arrival,departure,note,location:cities!check_ins_city_id_fkey(id,name,country_code,region,latitude,longitude)',
    )
    .neq('user_id', userId)
    .gte('departure', fromDate)
    .order('arrival')
    .order('id');
  if (throughDate) request.lte('arrival', throughDate);
  const { data, error } = await collectRows((from, to) => request.range(from, to));
  if (error) throw error;
  if (!data?.length) return [];
  const { data: profiles, error: profileError } = await database()
    .from('profiles')
    .select('id,full_name')
    .in('id', [...new Set(data.map((t) => t.user_id))]);
  if (profileError) throw profileError;
  return data.map((trip) => ({
    ...trip,
    full_name: profiles?.find((p) => p.id === trip.user_id)?.full_name ?? 'Community member',
  })) as unknown as NetworkTrip[];
}
