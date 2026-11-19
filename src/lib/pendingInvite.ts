import AsyncStorage from '@react-native-async-storage/async-storage';
import { invitationToken } from './invites';
const key = 'rendezwho.pending-invite.v1';
export async function rememberInvite(token: string) {
  await AsyncStorage.setItem(
    key,
    JSON.stringify({ token: invitationToken(token), expires: Date.now() + 3600000 }),
  );
}
export async function pendingInvite() {
  const value = await AsyncStorage.getItem(key);
  if (!value) return null;
  try {
    const stored = JSON.parse(value);
    if (stored.expires > Date.now()) return invitationToken(stored.token);
  } catch {
    /* Invalid/expired local state is discarded. */
  }
  await clearInvite();
  return null;
}
export async function clearInvite() {
  await AsyncStorage.removeItem(key);
}
