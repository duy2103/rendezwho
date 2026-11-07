import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../providers/AuthProvider';
import BrandSplash from '../components/BrandSplash';
import { useBrandFonts } from '../theme/useBrandFonts';
import { colors } from '../theme/tokens';
function Routes() {
  const { session, loading } = useAuth();
  const [fontsLoaded, fontError] = useBrandFonts();
  const [introduced, setIntroduced] = useState(false);
  useEffect(() => {
    if (!fontsLoaded) return;
    const timer = setTimeout(() => setIntroduced(true), 1400);
    return () => clearTimeout(timer);
  }, [fontsLoaded]);
  if (fontError) throw fontError;
  if (!fontsLoaded || !introduced || loading) return <BrandSplash />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
      <Stack.Screen name="auth/callback" />
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" />
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
        <Routes />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
