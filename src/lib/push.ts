import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { database } from './supabase';
const tokenKey = 'rendezwho.push-token';
export async function enablePush() {
  if (Platform.OS === 'web')
    throw new Error('Push notifications are available in the installed mobile app.');
  const Device = await import('expo-device');
  if (!Device.isDevice) throw new Error('Use a physical device to enable push notifications.');
  const Notifications = await import('expo-notifications');
  if (Platform.OS === 'android')
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Network updates',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted)
    throw new Error('Notifications are disabled. You can enable them in your device settings.');
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('Notification setup is unavailable.');
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const { error } = await database().rpc('app_register_push', {
    device_token: token,
    enabled: true,
  });
  if (error) throw error;
  await AsyncStorage.setItem(tokenKey, token);
}
export async function disablePush() {
  const token = await AsyncStorage.getItem(tokenKey);
  if (!token) return;
  const { error } = await database().rpc('app_register_push', {
    device_token: token,
    enabled: false,
  });
  if (error) throw error;
  await AsyncStorage.removeItem(tokenKey);
}
