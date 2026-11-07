import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { exchangeCode } from '../../lib/auth';
import { Button, Copy, Loading, Page } from '../../components/ui';
export default function Callback() {
  const {
    code,
    error_description: failure,
    next,
  } = useLocalSearchParams<{ code?: string; error_description?: string; next?: string }>();
  const [exchangeError, setError] = useState('');
  const error =
    failure || (!code ? 'No sign-in code was provided. Please sign in again.' : exchangeError);
  useEffect(() => {
    if (failure || !code) return;
    let active = true;
    exchangeCode(code)
      .then(() => {
        if (active) router.replace(next === 'reset' ? '/reset-password' : '/');
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [code, failure, next]);
  return (
    <Page title="Completing sign-in">
      {error ? (
        <>
          <Copy error>{error}</Copy>
          <Button title="Return" onPress={() => router.replace('/')} />
        </>
      ) : (
        <Loading />
      )}
    </Page>
  );
}
