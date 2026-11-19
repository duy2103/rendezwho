import { useAuth } from '../providers/AuthProvider';
import { useCallback } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { database, isSupabaseConfigured } from './supabase';

/** Refresh on focus, reconnect and foreground; polling covers missed Realtime events. */
export function useLiveRefresh(
  table: 'messages' | 'connections' | 'app_notifications',
  reload: () => Promise<void>,
  filter?: string,
) {
  const userId = useAuth().session?.user.id;
  useFocusEffect(
    useCallback(() => {
      if (!isSupabaseConfigured || !userId) return;
      let active = true;
      let running = false;
      const refresh = async () => {
        if (!active || running || AppState.currentState === 'background') return;
        running = true;
        try {
          await reload();
        } finally {
          running = false;
        }
      };
      const client = database();
      const channel = client
        .channel(`${table}:${filter ?? 'all'}:${Math.random()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
          () => {
            void refresh();
          },
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') void refresh();
        });
      const listener = AppState.addEventListener('change', (state) => {
        if (state === 'active') void refresh();
      });
      const timer = setInterval(() => {
        void refresh();
      }, 15000);
      return () => {
        active = false;
        clearInterval(timer);
        listener.remove();
        void client.removeChannel(channel);
      };
    }, [table, reload, filter, userId]),
  );
}
