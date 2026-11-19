import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
export function useResource<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const reload = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true);
    setError('');
    try {
      const next = await load();
      if (request === sequence.current) setData(next);
    } catch (e) {
      if (request === sequence.current) {
        setData(null);
        setError(
          e instanceof Error
            ? e.message
            : String((e as { message?: string })?.message ?? 'Could not load data.'),
        );
      }
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [load]);
  useFocusEffect(
    useCallback(() => {
      void reload();
      return () => {
        ++sequence.current;
      };
    }, [reload]),
  );
  return { data, loading, error, reload };
}
export function useMutation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(String((e as { message?: string })?.message ?? 'Could not save. Please try again.'));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run };
}
