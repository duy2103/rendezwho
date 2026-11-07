import { useCallback, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../providers/AuthProvider';
import {
  listConnections,
  respondConnection,
  disconnectConnection,
  listConversations,
  listMessages,
  sendMessage,
} from '../lib/data';
import { useMutation, useResource } from '../lib/useResource';
import { Button, Card, Copy, Field, Loading, Page } from '../components/ui';
export default function Messages() {
  const id = useAuth().session!.user.id;
  const { conversation } = useLocalSearchParams<{ conversation?: string }>();
  const groups = useResource(useCallback(() => listConversations(id), [id]));
  const active = groups.data?.find((c) => c.id === conversation);
  const messages = useResource(
    useCallback(() => (active ? listMessages(active.id) : Promise.resolve([])), [active]),
  );
  const connections = useResource(useCallback(() => listConnections(id), [id]));
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const mutation = useMutation();
  return (
    <Page title="Messages">
      {groups.loading && <Loading />}
      {!!groups.error && <Copy error>{groups.error}</Copy>}
      {!!mutation.error && <Copy error>{mutation.error}</Copy>}
      <Button
        title="Refresh"
        secondary
        onPress={() => {
          void groups.reload();
          void messages.reload();
          void connections.reload();
        }}
      />
      {!conversation && (
        <>
          {!!connections.error && <Copy error>{connections.error}</Copy>}
          {connections.data?.map((connection) => (
            <Card key={connection.id}>
              <Copy>
                {connection.name} · {connection.status}
              </Copy>
              {connection.status === 'pending' && connection.recipient_id === id && (
                <>
                  <Button
                    title="Accept request"
                    disabled={mutation.busy}
                    onPress={() =>
                      void mutation.run(async () => {
                        await respondConnection(connection.id, 'accepted');
                        await connections.reload();
                        await groups.reload();
                      })
                    }
                  />
                  <Button
                    title="Decline request"
                    secondary
                    disabled={mutation.busy}
                    onPress={() =>
                      void mutation.run(async () => {
                        await respondConnection(connection.id, 'declined');
                        await connections.reload();
                      })
                    }
                  />
                </>
              )}
              {connection.status === 'accepted' &&
                (disconnecting === connection.id ? (
                  <>
                    <Copy>Disconnect? Your conversation will close for new messages.</Copy>
                    <Button
                      title="Confirm disconnect"
                      disabled={mutation.busy}
                      onPress={() =>
                        void mutation.run(async () => {
                          await disconnectConnection(connection.id);
                          setDisconnecting(null);
                          await connections.reload();
                          await groups.reload();
                        })
                      }
                    />
                    <Button
                      title="Cancel"
                      secondary
                      disabled={mutation.busy}
                      onPress={() => setDisconnecting(null)}
                    />
                  </>
                ) : (
                  <Button
                    title="Disconnect"
                    secondary
                    onPress={() => setDisconnecting(connection.id)}
                  />
                ))}
            </Card>
          ))}
          {groups.data?.length === 0 && <Copy>No conversations yet.</Copy>}
          {groups.data?.map((group, index) => (
            <Button
              key={group.id}
              title={`Conversation ${index + 1}${group.closed_at ? ' · Closed' : ''}`}
              secondary
              onPress={() => {
                setBody('');
                router.setParams({ conversation: group.id });
              }}
            />
          ))}
        </>
      )}
      {conversation && (
        <>
          <Button title="All conversations" secondary onPress={() => router.replace('/messages')} />
          {!groups.loading && !active && <Copy>This conversation is not available.</Copy>}
          {messages.loading && <Loading />}
          {!!messages.error && <Copy error>{messages.error}</Copy>}
          {messages.data?.map((message) => (
            <Card key={message.id}>
              <Copy>
                {message.sender_id === id ? 'You' : 'Member'} ·{' '}
                {new Date(message.created_at).toLocaleString()}
              </Copy>
              <Copy>{message.body}</Copy>
            </Card>
          ))}
          {active && !active.closed_at && (
            <Card>
              <Field
                label="Message"
                value={body}
                onChangeText={setBody}
                multiline
                maxLength={3000}
              />
              <Button
                title="Send"
                disabled={mutation.busy || !body.trim()}
                onPress={() =>
                  void mutation.run(async () => {
                    await sendMessage(id, active.id, body);
                    setBody('');
                    await messages.reload();
                  })
                }
              />
            </Card>
          )}
          {messages.data?.length === 50 && <Copy>Showing the latest 50 messages.</Copy>}
        </>
      )}
    </Page>
  );
}
