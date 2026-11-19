import type { NotificationResponse } from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router, useRootNavigationState } from 'expo-router';
import { useAuth } from '../providers/AuthProvider';
export default function PushNotifications() {
  const navigation = useRootNavigationState();
  const userId = useAuth().session?.user.id;
  useEffect(() => {
    if (Platform.OS === 'web' || !userId || !navigation?.key) return;
    let active = true;
    let remove: (() => void) | undefined;
    void import('expo-notifications')
      .then(async (Notifications) => {
        if (!active) return;
        const open = (response: NotificationResponse | null) => {
          if (!active || !response) return;
          const data = response.notification.request.content.data;
          if (!data || data.userId !== userId || typeof data.target !== 'string') return;
          if (data.kind === 'message')
            router.push({ pathname: '/messages', params: { conversation: data.target } });
          else if (typeof data.kind === 'string' && data.kind.startsWith('meetup'))
            router.push('/meetups');
          else router.push('/notifications');
          void Notifications.clearLastNotificationResponseAsync();
        };
        const listener = Notifications.addNotificationResponseReceivedListener(open);
        remove = () => listener.remove();
        open(await Notifications.getLastNotificationResponseAsync());
      })
      .catch(() => {
        /* In-app notifications remain available in builds without native push support. */
      });
    return () => {
      active = false;
      remove?.();
    };
  }, [userId, navigation?.key]);
  return null;
}
