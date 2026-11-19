import { enablePush, disablePush } from '../lib/push';
import { useCallback, useState } from 'react';
import { Linking } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../providers/AuthProvider';
import { getPreferences, savePreferences, listBlocks, setBlock, isModerator } from '../lib/social';
import { useMutation, useResource } from '../lib/useResource';
import { Button, Card, Copy, Heading } from './ui';
export default function AccountSettings() {
  const [notice, setNotice] = useState('');
  const userId = useAuth().session!.user.id;
  const mutation = useMutation();
  const resource = useResource(
    useCallback(async () => {
      const [preferences, blocks, moderator] = await Promise.all([
        getPreferences(userId),
        listBlocks(),
        isModerator(),
      ]);
      return { preferences, blocks, moderator };
    }, [userId]),
  );
  return (
    <>
      <Heading>Settings and support</Heading>
      {!!notice && <Copy>{notice}</Copy>}
      <Button
        title="Enable push on this device"
        secondary
        disabled={mutation.busy}
        onPress={() =>
          void mutation.run(async () => {
            await enablePush();
            setNotice('Push notifications enabled on this device.');
          })
        }
      />
      <Button
        title="Disable push on this device"
        secondary
        disabled={mutation.busy}
        onPress={() =>
          void mutation.run(async () => {
            await disablePush();
            setNotice('Push notifications disabled on this device.');
          })
        }
      />
      {!!resource.error && (
        <>
          <Copy error>{resource.error}</Copy>
          <Button title="Retry settings" secondary onPress={() => void resource.reload()} />
        </>
      )}
      {!!mutation.error && <Copy error>{mutation.error}</Copy>}
      <Button title="Notifications" secondary onPress={() => router.push('/notifications')} />
      <Button title="Community meetups" secondary onPress={() => router.push('/meetups')} />
      {resource.data && (
        <Card>
          <Heading>In-app notifications</Heading>
          {(['messages', 'connections', 'meetups'] as const).map((key) => (
            <Button
              key={key}
              title={`${resource.data!.preferences[key] ? '✓' : '○'} ${key}`}
              secondary
              disabled={mutation.busy}
              onPress={() =>
                void mutation.run(async () => {
                  await savePreferences(userId, {
                    ...resource.data!.preferences,
                    [key]: !resource.data!.preferences[key],
                  });
                  await resource.reload();
                })
              }
            />
          ))}
        </Card>
      )}
      <Card>
        <Heading>Blocked accounts</Heading>
        <Copy>Unblocking does not restore a connection or reopen a conversation.</Copy>
        {resource.data?.blocks.length === 0 && <Copy>No blocked accounts.</Copy>}
        {resource.data?.blocks.map((block, index) => (
          <Button
            key={block.blocked_id}
            title={`Unblock account ${index + 1} · blocked ${new Date(block.created_at).toLocaleDateString()}`}
            secondary
            disabled={mutation.busy}
            onPress={() =>
              void mutation.run(async () => {
                await setBlock(block.blocked_id, false);
                await resource.reload();
              })
            }
          />
        ))}
      </Card>
      {[
        ['Privacy policy', process.env.EXPO_PUBLIC_PRIVACY_URL],
        ['Terms of use', process.env.EXPO_PUBLIC_TERMS_URL],
        ['Contact support', process.env.EXPO_PUBLIC_SUPPORT_URL],
        ['Request account deletion on the web', process.env.EXPO_PUBLIC_DELETION_URL],
      ].map(([title, url]) => (
        <Button
          key={title}
          title={title!}
          secondary
          onPress={() =>
            void mutation.run(async () => {
              if (!url || !/^https:\/\//.test(url))
                throw new Error(`${title} is not available yet. Please try again later.`);
              await Linking.openURL(url);
            })
          }
        />
      ))}
      <Button title="Community guidelines" secondary onPress={() => router.push('/guidelines')} />
      {resource.data?.moderator && (
        <Button title="Moderation queue" secondary onPress={() => router.push('/moderation')} />
      )}
    </>
  );
}
