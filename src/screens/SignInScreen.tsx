import { useCallback } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapPin, ShieldCheck, Users } from 'lucide-react-native';
import { SvgXml } from 'react-native-svg';
import { signInWithProvider } from '../lib/auth';
import { getAuthProviders } from '../lib/supabase';
import { useMutation, useResource } from '../lib/useResource';
import { Button, Copy } from '../components/ui';
import { colors, fonts } from '../theme/tokens';
import { apple } from '../theme/svg-assets';

export default function SignInScreen() {
  const { width } = useWindowDimensions();
  const mutation = useMutation();
  const providers = useResource(useCallback(() => getAuthProviders(), []));
  async function signIn(provider: 'google' | 'apple') {
    const available = providers.data ?? (await getAuthProviders());
    if (!available[provider])
      throw new Error(
        `${provider === 'google' ? 'Google' : 'Apple'} sign-in is not available yet. Please try again later.`,
      );
    await signInWithProvider(provider);
  }
  const openLegal = (url: string | undefined) => {
    if (url)
      void mutation.run(async () => {
        await Linking.openURL(url);
      });
  };
  return (
    <SafeAreaView style={s.screen}>
      {width >= 1024 && (
        <View style={s.aside}>
          <View style={s.asideContent}>
            <Text style={s.eyebrow}>YOUR WORLD, A LITTLE CLOSER</Text>
            <Text style={s.headline}>Know who’s nearby, without sharing everywhere you go.</Text>
            <Text style={s.description}>
              Share city-level plans with the communities you trust. No live tracking, no public
              broadcast, and no surprise visibility.
            </Text>
            <View style={{ gap: 12, marginTop: 36 }}>
              {[
                {
                  Icon: MapPin,
                  title: 'City-level only',
                  copy: 'Your precise location stays private.',
                  color: colors.goldSoft,
                },
                {
                  Icon: Users,
                  title: 'Shared by group',
                  copy: 'Every check-in has its own audience.',
                  color: colors.peach,
                },
                {
                  Icon: ShieldCheck,
                  title: 'Always reversible',
                  copy: 'Edit or revoke access whenever you want.',
                  color: colors.teal,
                },
              ].map(({ Icon, title, copy, color }) => (
                <View key={title} style={s.feature}>
                  <View style={[s.featureIcon, { backgroundColor: color }]}>
                    <Icon size={17} color={colors.ink} />
                  </View>
                  <View>
                    <Text style={s.featureTitle}>{title}</Text>
                    <Text style={s.featureCopy}>{copy}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
          <Text style={s.featureCopy}>
            Your location and review data are never sold or made public.
          </Text>
        </View>
      )}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.main, width >= 640 && { paddingHorizontal: 40 }]}
      >
        <View style={s.form}>
          <Text accessibilityRole="header" style={s.title}>
            Sign in to your world
          </Text>
          <View style={s.buttons}>
            <Button
              title="Continue with Google"
              secondary
              disabled={mutation.busy}
              icon={<Text style={s.google}>G</Text>}
              onPress={() => void mutation.run(() => signIn('google'))}
            />
            <Button
              title="Continue with Apple"
              secondary
              disabled={mutation.busy}
              icon={
                <View style={s.apple}>
                  <SvgXml xml={apple} />
                </View>
              }
              onPress={() => void mutation.run(() => signIn('apple'))}
            />
          </View>
          <Text style={s.legal}>
            By continuing, you agree to the{' '}
            <Text
              accessibilityRole={process.env.EXPO_PUBLIC_TERMS_URL ? 'link' : undefined}
              onPress={() => openLegal(process.env.EXPO_PUBLIC_TERMS_URL)}
            >
              Terms of Service
            </Text>{' '}
            and{' '}
            <Text
              accessibilityRole={process.env.EXPO_PUBLIC_PRIVACY_URL ? 'link' : undefined}
              onPress={() => openLegal(process.env.EXPO_PUBLIC_PRIVACY_URL)}
            >
              Privacy Policy
            </Text>
            .
          </Text>
          {!!mutation.error && (
            <View style={{ marginTop: 20 }}>
              <Copy error>{mutation.error}</Copy>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'row', backgroundColor: colors.paper },
  main: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  form: { width: '100%', maxWidth: 448, paddingVertical: 40 },
  title: { fontFamily: fonts.serif, fontSize: 36, lineHeight: 40, color: colors.ink },
  buttons: { marginTop: 28, gap: 12 },
  google: {
    fontFamily: fonts.bold,
    color: colors.tealDeep,
    fontSize: 10,
    width: 20,
    height: 20,
    lineHeight: 20,
    textAlign: 'center',
    borderRadius: 10,
    backgroundColor: colors.paper,
    boxShadow: '0px 1px 2px #44403c15',
  },
  apple: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  legal: {
    fontFamily: fonts.body,
    fontSize: 10,
    lineHeight: 16.25,
    textAlign: 'center',
    color: colors.muted,
    marginTop: 20,
  },
  aside: {
    width: '42.5%',
    backgroundColor: colors.soft,
    paddingHorizontal: 40,
    paddingTop: 64,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },
  asideContent: { maxWidth: 448, marginVertical: 'auto' },
  eyebrow: { fontFamily: fonts.bold, fontSize: 10.88, letterSpacing: 1.52, color: colors.tealDeep },
  headline: {
    fontFamily: fonts.serif,
    fontSize: 48,
    lineHeight: 50,
    letterSpacing: -1.2,
    color: colors.ink,
    marginTop: 16,
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 23,
    color: colors.muted,
    marginTop: 20,
    maxWidth: 384,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.paper,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: { fontFamily: fonts.bold, fontSize: 12, color: colors.ink },
  featureCopy: { fontFamily: fonts.body, fontSize: 10, color: colors.muted, marginTop: 2 },
});
