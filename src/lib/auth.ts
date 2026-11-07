import { makeRedirectUri } from 'expo-auth-session';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { database } from './supabase';
WebBrowser.maybeCompleteAuthSession();
export const redirectTo = makeRedirectUri({
  scheme: 'rendezwho',
  path: 'auth/callback',
  native: 'rendezwho://auth/callback',
});
const exchanges = new Map<string, Promise<void>>();
export function exchangeCode(code: string) {
  const existing = exchanges.get(code);
  if (existing) return existing;
  const promise = database()
    .auth.exchangeCodeForSession(code)
    .then(({ error }) => {
      if (error) throw error;
    });
  exchanges.set(code, promise);
  // Retain briefly so the browser result and deep-link route cannot redeem a code twice.
  void promise.finally(() => setTimeout(() => exchanges.delete(code), 60_000)).catch(() => {});
  return promise;
}
export async function signInWithProvider(provider: 'google' | 'apple') {
  if (
    Platform.OS !== 'web' &&
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  ) {
    throw new Error(
      'Sign-in requires the Rendezwho development build. Expo Go cannot open the app’s sign-in callback. Install the development build and try again.',
    );
  }
  const { data, error } = await database().auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) {
    if (/not enabled|unsupported provider/i.test(error.message))
      throw new Error(
        `${provider === 'google' ? 'Google' : 'Apple'} sign-in is not available yet. Please try again later.`,
      );
    throw error;
  }
  if (!data.url) throw new Error('The sign-in provider did not return a URL.');
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return;
  const url = new URL(result.url);
  const failure = url.searchParams.get('error_description');
  if (failure) throw new Error(failure);
  const code = url.searchParams.get('code');
  if (!code) throw new Error('Sign-in did not return an authorization code. Please try again.');
  await exchangeCode(code);
}
