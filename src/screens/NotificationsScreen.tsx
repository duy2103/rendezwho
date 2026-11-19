import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { listNotifications, readNotification } from '../lib/social';
import { useMutation, useResource } from '../lib/useResource';
import { useLiveRefresh } from '../lib/useLiveRefresh';
import { Button, Card, Copy, Page, Loading } from '../components/ui';
const labels: Record<string, string> = {
  message: 'New message',
  connection_request: 'New connection request',
  connection_accepted: 'Connection accepted',
  meetup_updated: 'Meetup details changed',
  meetup_cancelled: 'Meetup cancelled',
};
export default function NotificationsScreen() {
  const [limit, setLimit] = useState(50);
  const resource = useResource(useCallback(() => listNotifications(limit), [limit]));
  const mutation = useMutation();
  useLiveRefresh('app_notifications', resource.reload);
  return (
    <Page
      title="Notifications"
      onRefresh={() => void resource.reload()}
      refreshing={resource.loading}
    >
      {resource.loading && !resource.data && <Loading />}
      {!!resource.error && <Copy error>{resource.error}</Copy>}
      {!!mutation.error && <Copy error>{mutation.error}</Copy>}
      <Button
        title="Mark all as read"
        secondary
        disabled={mutation.busy}
        onPress={() =>
          void mutation.run(async () => {
            await readNotification();
            await resource.reload();
          })
        }
      />
      {resource.data?.length === 0 && <Copy>You’re all caught up.</Copy>}
      {resource.data?.map((item) => (
        <Card key={item.id}>
          <Copy>
            {!item.read_at ? '● ' : ''}
            {labels[item.kind] ?? 'Network update'} · {new Date(item.created_at).toLocaleString()}
          </Copy>
          <Button
            title="Open"
            secondary
            onPress={() =>
              void mutation.run(async () => {
                await readNotification(item.id);
                if (item.kind === 'message')
                  router.push({ pathname: '/messages', params: { conversation: item.target_id } });
                else if (item.kind.startsWith('connection')) router.push('/messages');
                else router.push('/meetups');
              })
            }
          />
        </Card>
      ))}
      {resource.data?.length === limit && (
        <Button title="Load older notifications" secondary onPress={() => setLimit(limit + 50)} />
      )}
    </Page>
  );
}
