import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const isSupabaseConfigured = Boolean(url?.startsWith('https://') && key);
export const supabase = isSupabaseConfigured
  ? createClient(url!, key!, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    })
  : null;
export function database() {
  if (!supabase)
    throw new Error('Supabase is not configured. Add the public project settings to .env.local.');
  return supabase;
}

/** Public auth capabilities, used to avoid sending people into a disabled provider. */
export async function getAuthProviders(): Promise<{ google: boolean; apple: boolean }> {
  database();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key! },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Sign-in is temporarily unavailable. Please try again.');
    const settings = await response.json();
    return { google: settings.external?.google === true, apple: settings.external?.apple === true };
  } finally {
    clearTimeout(timeout);
  }
}
