import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../providers/AuthProvider';
import { listConnections, disconnectConnection, type Message } from '../lib/data';
import {
  conversationSummaries,
  markConversationRead,
  messagePage,
  sendReliableMessage,
} from '../lib/social';
import { useMutation, useResource } from '../lib/useResource';
import { useLiveRefresh } from '../lib/useLiveRefresh';
import { Button, Card, Copy, Field, Loading, Page } from '../components/ui';
import SafetyActions from '../components/SafetyActions';
import ConnectionAction from '../components/ConnectionAction';

function Thread({
  id,
  userId,
  closed,
  name,
  onRead,
}: {
  id: string;
  userId: string;
  closed: boolean;
  name: string;
  onRead: () => Promise<void>;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [olderBusy, setOlderBusy] = useState(false);
  const loadedCount = useRef(50);
  const alive = useRef(true);
  const generation = useRef(0);
  const retry = useRef<{ body: string; key: string } | null>(null);
  const mutation = useMutation();
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    try {
      let latest = await messagePage(id);
      let hasMore = latest.length === 50;
      while (hasMore && latest.length < loadedCount.current) {
        const older = await messagePage(id, latest[0]);
        latest = [...older, ...latest];
        hasMore = older.length === 50;
      }
      if (!alive.current || request !== generation.current) return;
      // Revalidate the entire loaded window, including removals and permission changes.
      setMessages(latest);
      setMore(hasMore);
      setError('');
      const last = latest.at(-1);
      if (last) {
        await markConversationRead(id, last.id);
        await onRead();
      }
    } catch (e) {
      if (alive.current) setError(String((e as Error).message));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [id, onRead]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
      return () => {
        generation.current++;
      };
    }, [refresh]),
  );
  useLiveRefresh('messages', refresh, `conversation_id=eq.${id}`);
  const loadOlder = async () => {
    if (!messages.length || olderBusy) return;
    setOlderBusy(true);
    const request = generation.current;
    try {
      const older = await messagePage(id, messages[0]);
      if (!alive.current || request !== generation.current) return;
      loadedCount.current += older.length;
      setMessages((current) => [...new Map([...older, ...current].map((m) => [m.id, m])).values()]);
      setMore(older.length === 50);
    } catch (e) {
      if (alive.current) setError(String((e as Error).message));
    } finally {
      if (alive.current) setOlderBusy(false);
    }
  };
  return (
    <>
      {loading && <Loading />}
      {!!error && <Copy error>{error}</Copy>}
      <Button title="Refresh conversation" secondary onPress={() => void refresh()} />
      {more && (
        <Button
          title={olderBusy ? 'Loading…' : 'Load older messages'}
          secondary
          disabled={olderBusy}
          onPress={() => void loadOlder()}
        />
      )}
      <View style={{ height: 420 }}>
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: 12 }}
          renderItem={({ item }) => (
            <Card>
              <Copy>
                {item.sender_id === userId ? 'You' : name} ·{' '}
                {new Date(item.created_at).toLocaleString()}
              </Copy>
              <Copy>{item.body}</Copy>
              {item.sender_id !== userId && (
                <SafetyActions
                  kind="message"
                  target={item.id}
                  userId={item.sender_id}
                  onChanged={refresh}
                />
              )}
            </Card>
          )}
          ListEmptyComponent={!loading ? <Copy>No messages yet.</Copy> : undefined}
        />
      </View>
      {closed ? (
        <Copy>This conversation is closed. Its history is read-only.</Copy>
      ) : (
        <Card>
          {!!mutation.error && (
            <Copy error>{mutation.error} Your draft is kept. Retry sending when you’re ready.</Copy>
          )}
          <Field
            label="Message"
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={3000}
            editable={!mutation.busy}
          />
          <Button
            title={mutation.busy ? 'Sending…' : 'Send'}
            disabled={mutation.busy || !body.trim()}
            onPress={() =>
              void mutation.run(async () => {
                const content = body.trim();
                if (!retry.current || retry.current.body !== content)
                  retry.current = {
                    body: content,
                    key: `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,
                  };
                await sendReliableMessage(id, content, retry.current.key);
                setBody('');
                retry.current = null;
                await refresh();
              })
            }
          />
        </Card>
      )}
    </>
  );
}
export default function Messages() {
  const id = useAuth().session!.user.id;
  const { conversation } = useLocalSearchParams<{ conversation?: string }>();
  const groups = useResource(useCallback(() => conversationSummaries(), []));
  const connections = useResource(useCallback(() => listConnections(id), [id]));
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const mutation = useMutation();
  const reloadGroups = groups.reload;
  const reloadConnections = connections.reload;
  const refresh = useCallback(async () => {
    await Promise.all([reloadGroups(), reloadConnections()]);
  }, [reloadGroups, reloadConnections]);
  useLiveRefresh('connections', refresh);
  useLiveRefresh('app_notifications', groups.reload);
  const active = groups.data?.find((c) => c.id === conversation);
  return (
    <Page
      title={active?.name ?? 'Messages'}
      onRefresh={() => void refresh()}
      refreshing={groups.loading}
    >
      {!!groups.error && <Copy error>{groups.error}</Copy>}
      {!!connections.error && <Copy error>{connections.error}</Copy>}
      {!!mutation.error && <Copy error>{mutation.error}</Copy>}
      {groups.loading && !groups.data && <Loading />}
      {!conversation ? (
        <>
          {connections.data
            ?.filter((c) => c.status === 'pending' || c.status === 'accepted')
            .map((connection) => (
              <Card key={connection.id}>
                <Copy>
                  {connection.name} · {connection.status}
                </Copy>
                {connection.status === 'pending' && (
                  <ConnectionAction
                    userId={
                      connection.sender_id === id ? connection.recipient_id : connection.sender_id
                    }
                    currentUserId={id}
                    connection={connection}
                    onChanged={refresh}
                  />
                )}
                {connection.status === 'accepted' && (
                  <>
                    {disconnecting === connection.id && (
                      <Copy>Disconnect and close this conversation for new messages?</Copy>
                    )}
                    <Button
                      title={disconnecting === connection.id ? 'Confirm disconnect' : 'Disconnect'}
                      secondary
                      disabled={mutation.busy}
                      onPress={() => {
                        if (disconnecting !== connection.id) {
                          setDisconnecting(connection.id);
                          return;
                        }
                        void mutation.run(async () => {
                          await disconnectConnection(connection.id);
                          setDisconnecting(null);
                          await refresh();
                        });
                      }}
                    />
                    {disconnecting === connection.id && (
                      <Button title="Cancel" secondary onPress={() => setDisconnecting(null)} />
                    )}
                  </>
                )}
              </Card>
            ))}
          {groups.data?.length === 0 && (
            <Copy>No conversations yet. Connect with someone in your communities.</Copy>
          )}
          {groups.data?.map((group) => (
            <Card key={group.id}>
              <Copy>
                {group.name}
                {group.unread > 0 ? ` · ${group.unread} unread` : ''}
                {group.closed_at ? ' · Closed' : ''}
              </Copy>
              <Copy>{group.preview || 'Start a conversation'}</Copy>
              <Button
                title="Open conversation"
                onPress={() => router.setParams({ conversation: group.id })}
              />
            </Card>
          ))}
        </>
      ) : (
        <>
          <Button title="All conversations" secondary onPress={() => router.replace('/messages')} />
          {!groups.loading && !active && <Copy>This conversation is no longer available.</Copy>}
          {active && (
            <Thread
              key={active.id}
              id={active.id}
              userId={id}
              closed={!!active.closed_at}
              name={active.name}
              onRead={groups.reload}
            />
          )}
        </>
      )}
    </Page>
  );
}
