import { database } from './supabase';
import type { Message } from './data';

export type ReportKind = 'profile' | 'message' | 'review' | 'community' | 'meetup';
export async function reportContent(kind: ReportKind, target: string, reason: string) {
  if (reason.trim().length < 3) throw new Error('Please describe what happened.');
  const { error } = await database().rpc('app_report', { kind, target, reason: reason.trim() });
  if (error) throw error;
}
export async function setBlock(target: string, blocked: boolean) {
  const { error } = await database().rpc('app_set_block', { target, blocked });
  if (error) throw error;
}
export async function listBlocks() {
  const { data, error } = await database()
    .from('app_blocks')
    .select('blocked_id,created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as { blocked_id: string; created_at: string }[];
}
export async function manageCommunity(
  target: string,
  operation: 'edit' | 'delete' | 'role' | 'remove',
  member: string | null = null,
  value = '',
  description = '',
) {
  const { error } = await database().rpc('app_manage_community', {
    target,
    operation,
    member,
    value,
    description,
  });
  if (error) throw error;
}
export async function onboardingState(userId: string) {
  const { data, error } = await database()
    .from('profiles')
    .select('onboarding_completed_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.onboarding_completed_at);
}
export async function finishOnboarding(
  displayName: string,
  biography: string,
  location: string | null,
) {
  const { error } = await database().rpc('app_finish_onboarding', {
    display_name: displayName,
    biography,
    location,
  });
  if (error) throw error;
}
export type Notification = {
  id: string;
  kind: string;
  target_id: string;
  actor_id: string | null;
  created_at: string;
  read_at: string | null;
};
export async function listNotifications(limit = 50) {
  const { data, error } = await database()
    .from('app_notifications')
    .select('id,kind,target_id,actor_id,created_at,read_at')
    .order('created_at', { ascending: false })
    .order('id')
    .limit(limit);
  if (error) throw error;
  return data as Notification[];
}
export async function unreadCount() {
  const { count, error } = await database()
    .from('app_notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}
export async function readNotification(id?: string) {
  const request = database()
    .from('app_notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);
  if (id) request.eq('id', id);
  const { error } = await request;
  if (error) throw error;
}
export type Preferences = { messages: boolean; connections: boolean; meetups: boolean };
export async function getPreferences(userId: string): Promise<Preferences> {
  const { data, error } = await database()
    .from('app_notification_preferences')
    .select('messages,connections,meetups')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? { messages: true, connections: true, meetups: true };
}
export async function savePreferences(userId: string, values: Preferences) {
  const { error } = await database()
    .from('app_notification_preferences')
    .upsert({ user_id: userId, ...values });
  if (error) throw error;
}
export async function messagePage(
  conversation: string,
  before?: Pick<Message, 'id' | 'created_at'>,
) {
  let request = database()
    .from('messages')
    .select('id,sender_id,conversation_id,body,created_at')
    .eq('conversation_id', conversation)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(50);
  if (before) {
    // Values originate from validated database records, never raw route input.
    if (!/^[0-9a-f-]{36}$/i.test(before.id) || !Number.isFinite(Date.parse(before.created_at)))
      throw new Error('Invalid history cursor.');
    if (!/^[0-9T:.+Z-]+$/.test(before.created_at)) throw new Error('Invalid history cursor.');
    const stamp = before.created_at;
    request = request.or(`created_at.lt.${stamp},and(created_at.eq.${stamp},id.lt.${before.id})`);
  }
  const { data, error } = await request;
  if (error) throw error;
  return (data as Message[]).reverse();
}
export async function sendReliableMessage(target: string, content: string, retryKey: string) {
  const { error } = await database().rpc('app_send_message', {
    target,
    content,
    retry_key: retryKey,
  });
  if (error) throw error;
}
export async function markConversationRead(target: string, message: string) {
  const { error } = await database().rpc('app_mark_conversation_read', {
    target,
    through_message: message,
  });
  if (error) throw error;
}
export type ConversationSummary = {
  id: string;
  closed_at: string | null;
  name: string;
  peer: string | null;
  preview: string;
  updated: string;
  unread: number;
};
export async function conversationSummaries(): Promise<ConversationSummary[]> {
  const { data, error } = await database().rpc('app_conversations');
  if (error) throw error;
  return data as ConversationSummary[];
}
export type ModerationReport = {
  id: string;
  target_type: ReportKind;
  reason: string;
  evidence: Record<string, string>;
  status: string;
  resolution: string;
  created_at: string;
};
export async function isModerator() {
  const { data, error } = await database().rpc('app_is_moderator');
  if (error) throw error;
  return Boolean(data);
}
export async function listReports(limit = 50) {
  const { data, error } = await database()
    .from('app_reports')
    .select('id,target_type,reason,evidence,status,resolution,created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as ModerationReport[];
}
export async function resolveReport(target: string, decision: string, note: string) {
  const { error } = await database().rpc('app_resolve_report', { target, decision, note });
  if (error) throw error;
}

export async function listContentRules() {
  const { data, error } = await database()
    .from('app_content_rules')
    .select('phrase')
    .order('phrase');
  if (error) throw error;
  return data as { phrase: string }[];
}
export async function setContentRule(phrase: string, enabled: boolean) {
  const { error } = await database().rpc('app_set_content_rule', { phrase, enabled });
  if (error) throw error;
}
