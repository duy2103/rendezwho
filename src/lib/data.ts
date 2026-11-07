import { validateDates } from './validation';
import { database } from './supabase';
export type Profile = {
  id: string;
  full_name: string;
  home_city: string;
  home_city_id: string | null;
  bio: string;
};
export type City = { id: string; name: string; country_code: string | null; region: string };
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
export type Place = {
  id: string;
  city_id: string;
  name: string;
  address: string;
  category: string | null;
};
export type SavedPlace = { id: string; user_id: string; city: string; name: string; note: string };
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
    .update({ full_name: fullName.trim(), bio: bio.trim(), home_city: city?.name ?? '' })
    .eq('id', userId)
    .select('id')
    .single();
  if (error) throw error;
  if (!data) throw new Error('Your profile is unavailable. Please contact support.');
}
export async function searchCities(term: string) {
  const { data, error } = await database()
    .from('cities')
    .select('id,name,country_code,region')
    .ilike('name', `%${term.replace(/[%_]/g, '')}%`)
    .order('name')
    .limit(20);
  if (error) throw error;
  return data as City[];
}
export async function listTrips(userId: string) {
  const { data, error } = await database()
    .from('check_ins')
    .select('id,user_id,city_id,city,arrival,departure,note')
    .eq('user_id', userId)
    .order('arrival', { ascending: false })
    .limit(100);
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
  const { data, error } = await database().rpc('save_checkin', {
    checkin_id: id ?? null,
    city_name: city.name.trim(),
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
export async function listSaved(userId: string) {
  const { data, error } = await database()
    .from('saved_places')
    .select('id,user_id,city,name,note')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data as SavedPlace[];
}
export async function searchPlaces(cityId: string, term: string) {
  const { data, error } = await database()
    .from('places')
    .select('id,city_id,name,address,category')
    .eq('city_id', cityId)
    .ilike('name', `%${term.replace(/[%_]/g, '')}%`)
    .order('name')
    .limit(20);
  if (error) throw error;
  return data as Place[];
}
export async function savePlace(userId: string, city: City, place: Place, note: string) {
  if (city.id !== place.city_id) throw new Error('Choose a place in the selected city.');
  const { error } = await database().from('saved_places').insert({
    user_id: userId,
    city: city.name,
    name: place.name,
    category: place.category,
    note: note.trim(),
  });
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
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token.trim()))
    throw new Error('Enter the full invitation code.');
  const { data, error } = await database().rpc('join_community', { invite_token: token.trim() });
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
  const { data, error } = await database()
    .from('invites')
    .select('id,token,expires_at,revoked_at,use_count,max_uses')
    .eq('community_id', groupId)
    .order('created_at', { ascending: false })
    .limit(40);
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
  const { data, error } = await database()
    .from('memberships')
    .select('user_id,role')
    .eq('community_id', groupId)
    .order('joined_at')
    .limit(100);
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
  const { data, error } = await database()
    .from('connections')
    .select('id,sender_id,recipient_id,status')
    .order('created_at', { ascending: false })
    .limit(100);
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

export type NetworkTrip = Omit<Trip, 'group_ids'> & { full_name: string };
/** RLS determines visibility; never request precise coordinates or bypass shares. */
export async function listNetworkTrips(userId: string) {
  const { data, error } = await database()
    .from('check_ins')
    .select('id,user_id,city_id,city,arrival,departure,note')
    .neq('user_id', userId)
    .gte('departure', new Date().toISOString().slice(0, 10))
    .order('arrival')
    .limit(100);
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
  })) as NetworkTrip[];
}
