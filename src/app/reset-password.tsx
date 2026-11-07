import { useState } from 'react';
import { router } from 'expo-router';
import { database } from '../lib/supabase';
import { Page, Field, Button, Copy } from '../components/ui';
export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { error: failure } = await database().auth.updateUser({ password });
      if (failure) throw failure;
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update password.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page title="New password">
      <Field
        label="New password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
      />
      {!!error && <Copy error>{error}</Copy>}
      <Button title="Save password" disabled={busy} onPress={() => void save()} />
    </Page>
  );
}
