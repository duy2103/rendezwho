import { useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { getProfile, listConnections } from '../lib/data';
import { useResource } from '../lib/useResource';
import { useAuth } from '../providers/AuthProvider';
import { Page, Copy, Loading } from '../components/ui';
import ConnectionAction from '../components/ConnectionAction';
import SafetyActions from '../components/SafetyActions';
export default function Member() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = useAuth().session!.user.id;
  const resource = useResource(
    useCallback(async () => {
      const [profile, connections] = await Promise.all([getProfile(id), listConnections(userId)]);
      return { profile, connections };
    }, [id, userId]),
  );
  return (
    <Page title={resource.data?.profile?.full_name ?? 'Member profile'}>
      {resource.loading && <Loading />}
      {!!resource.error && <Copy error>{resource.error}</Copy>}
      {!resource.loading && !resource.data?.profile && <Copy>This profile is unavailable.</Copy>}
      {resource.data?.profile && (
        <>
          <Copy>{resource.data.profile.bio}</Copy>
          <Copy>{resource.data.profile.home_city}</Copy>
          {id !== userId && (
            <>
              <ConnectionAction
                userId={id}
                currentUserId={userId}
                connection={resource.data.connections.find(
                  (c) => c.sender_id === id || c.recipient_id === id,
                )}
                onChanged={resource.reload}
              />
              <SafetyActions kind="profile" target={id} userId={id} onChanged={resource.reload} />
            </>
          )}
        </>
      )}
    </Page>
  );
}
