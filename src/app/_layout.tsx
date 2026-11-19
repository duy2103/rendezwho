import PushNotifications from '../components/PushNotifications';
import { useEffect, useState } from 'react';
import { Stack, router, usePathname, type ErrorBoundaryProps } from 'expo-router';
import { pendingInvite } from '../lib/pendingInvite';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../providers/AuthProvider';
import BrandSplash from '../components/BrandSplash';
import { useBrandFonts } from '../theme/useBrandFonts';
import { Button, Copy, Page } from '../components/ui';
import { onboardingState } from '../lib/social';
import { database } from '../lib/supabase';
import { colors } from '../theme/tokens';
function Routes() {
  const { session, loading, error: authError, retry: retryAuth } = useAuth();
  const [setupError, setSetupError] = useState('');
  const [retry, setRetry] = useState(0);
  const pathname = usePathname();
  const [fontsLoaded, fontError] = useBrandFonts();
  const [introduced, setIntroduced] = useState(false);
  useEffect(() => {
    if (!fontsLoaded) return;
    const timer = setTimeout(() => setIntroduced(true), 1400);
    return () => clearTimeout(timer);
  }, [fontsLoaded]);
  useEffect(() => {
    if (
      !session ||
      loading ||
      !fontsLoaded ||
      !introduced ||
      pathname === '/join' ||
      pathname === '/auth/callback' ||
      pathname === '/reset-password' ||
      pathname === '/onboarding' ||
      pathname === '/guidelines'
    )
      return;
    let active = true;
    void onboardingState(session.user.id)
      .then(async (complete) => {
        if (!active) return;
        setSetupError('');
        if (!complete) {
          router.replace('/onboarding');
          return;
        }
        const token = await pendingInvite();
        if (active && token) router.replace('/join');
      })
      .catch((e) => {
        if (active) setSetupError(String(e.message ?? 'Could not load your account.'));
      });
    return () => {
      active = false;
    };
  }, [session, loading, fontsLoaded, introduced, pathname, retry]);
  if (fontError) throw fontError;
  if (!fontsLoaded || !introduced || loading) return <BrandSplash />;
  if ((session && setupError) || authError)
    return (
      <Page title="Could not load your account" header={false}>
        <Copy error>{setupError || authError}</Copy>
        <Button
          title="Retry"
          onPress={() => {
            if (authError) retryAuth();
            setRetry((value) => value + 1);
          }}
        />
        <Button title="Sign out" secondary onPress={() => void database().auth.signOut()} />
      </Page>
    );
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
      <Stack.Screen name="auth/callback" />
      <Stack.Screen name="join" />
      <Stack.Screen name="guidelines" />
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="meetups" />
        <Stack.Screen name="member" />
        <Stack.Screen name="moderation" />
        <Stack.Screen name="reset-password" />
      </Stack.Protected>
    </Stack>
  );
}
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <SessionRoutes />
        <PushNotifications />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <Page title="Something went wrong" header={false}>
      <Copy>Please try again. If the problem continues, restart the app.</Copy>
      <Button title="Try again" onPress={() => void retry()} />
    </Page>
  );
}

function SessionRoutes() {
  const { session } = useAuth();
  return <Routes key={session?.user.id ?? 'signed-out'} />;
}
