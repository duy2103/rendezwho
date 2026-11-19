import { useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../providers/AuthProvider';
import { joinCommunity } from '../lib/data';
import { invitationToken } from '../lib/invites';
import { clearInvite, pendingInvite, rememberInvite } from '../lib/pendingInvite';
import { useMutation } from '../lib/useResource';
import { Button, Copy, Loading, Page } from '../components/ui';
export default function Join() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  return <JoinInvitation key={JSON.stringify(params.token ?? null)} rawToken={params.token} />;
}
function JoinInvitation({ rawToken }: { rawToken?: string | string[] }) {
  const { session } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const mutation = useMutation();
  useEffect(() => {
    let active = true;
    void (async () => {
      if (Array.isArray(rawToken)) throw new Error('Invalid invitation link.');
      const next = rawToken ? invitationToken(rawToken) : await pendingInvite();
      if (!next) throw new Error('No invitation code was provided.');
      await rememberInvite(next);
      if (active) setToken(next);
    })()
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [rawToken]);
  return (
    <Page title="Join a community" subtitle="Confirm before using this invitation.">
      {!ready && <Loading />}
      {!!error && <Copy error>{error}</Copy>}
      {!!mutation.error && <Copy error>{mutation.error}</Copy>}
      {ready && token && (
        <>
          <Copy>Invitation code: {token}</Copy>
          {Platform.OS === 'web' && (
            <>
              <Button
                title="Open in the Rendezwho app"
                secondary
                onPress={() =>
                  void mutation.run(async () => {
                    await Linking.openURL(`rendezwho://join?token=${encodeURIComponent(token)}`);
                  })
                }
              />
              <Copy>
                If the app is not installed, sign in here or copy this code into Join group on
                another device.
              </Copy>
            </>
          )}
          {session ? (
            <Button
              title="Join community"
              disabled={mutation.busy}
              onPress={() =>
                void mutation.run(async () => {
                  await joinCommunity(token);
                  await clearInvite();
                  router.replace('/(tabs)/communities');
                })
              }
            />
          ) : (
            <>
              <Copy>Sign in to continue. Your invitation will be kept for one hour.</Copy>
              <Button title="Sign in to continue" onPress={() => router.push('/sign-in')} />
            </>
          )}
        </>
      )}
      <Button
        title="Cancel"
        secondary
        disabled={mutation.busy}
        onPress={() =>
          void mutation.run(async () => {
            await clearInvite();
            router.replace('/');
          })
        }
      />
    </Page>
  );
}
