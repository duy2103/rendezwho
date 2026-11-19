import { router } from 'expo-router';
import { requestConnection, respondConnection, type Connection } from '../lib/data';
import { useMutation } from '../lib/useResource';
import { Button, Copy } from './ui';
export default function ConnectionAction({
  userId,
  currentUserId,
  connection,
  onChanged,
}: {
  userId: string;
  currentUserId: string;
  connection?: Connection;
  onChanged: () => Promise<void>;
}) {
  const mutation = useMutation();
  const incoming = connection?.status === 'pending' && connection.recipient_id === currentUserId;
  const pending = connection?.status === 'pending' && !incoming;
  return (
    <>
      {!!mutation.error && <Copy error>{mutation.error}</Copy>}
      <Button
        title={
          connection?.status === 'accepted'
            ? 'Open messages'
            : incoming
              ? 'Accept connection'
              : pending
                ? 'Request sent'
                : 'Request to connect'
        }
        secondary
        disabled={mutation.busy || pending}
        onPress={() => {
          if (connection?.status === 'accepted') {
            router.push('/messages');
            return;
          }
          void mutation.run(async () => {
            if (incoming && connection) await respondConnection(connection.id, 'accepted');
            else await requestConnection(userId);
            await onChanged();
          });
        }}
      />
      {incoming && connection && (
        <Button
          title="Decline"
          secondary
          disabled={mutation.busy}
          onPress={() =>
            void mutation.run(async () => {
              await respondConnection(connection.id, 'declined');
              await onChanged();
            })
          }
        />
      )}
    </>
  );
}
