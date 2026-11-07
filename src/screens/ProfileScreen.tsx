import { useCallback, useState } from 'react';
import { database } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import {
  deleteMyAccount,
  getProfile,
  saveProfile,
  type City,
  type Profile as ProfileData,
} from '../lib/data';
import { useMutation, useResource } from '../lib/useResource';
import CityPicker from '../components/CityPicker';
import { Button, Card, Copy, Field, Loading, Page } from '../components/ui';
function ProfileForm({
  profile,
  id,
  initialName,
}: {
  profile: ProfileData | null;
  id: string;
  initialName: string;
}) {
  const mutation = useMutation();
  const [name, setName] = useState(profile?.full_name ?? initialName);
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [city, setCity] = useState<City | null>(
    profile?.home_city_id
      ? { id: profile.home_city_id, name: profile.home_city, country_code: null, region: '' }
      : null,
  );
  const [notice, setNotice] = useState('');
  return (
    <Card>
      <Field label="Full name" value={name} onChangeText={setName} maxLength={100} />
      <Field label="Bio" value={bio} onChangeText={setBio} maxLength={1000} multiline />
      <Copy>Home city (optional)</Copy>
      <CityPicker value={city} onChange={setCity} />
      {!!mutation.error && <Copy error>{mutation.error}</Copy>}
      {!!notice && <Copy>{notice}</Copy>}
      <Button
        title="Save profile"
        disabled={mutation.busy}
        onPress={() =>
          void mutation.run(async () => {
            setNotice('');
            await saveProfile(id, name, bio, city);
            setNotice('Profile saved.');
          })
        }
      />
    </Card>
  );
}
function DeleteAccount() {
  const [confirmation, setConfirmation] = useState('');
  const [open, setOpen] = useState(false);
  const mutation = useMutation();
  if (!open) return <Button title="Delete my account" secondary onPress={() => setOpen(true)} />;
  return (
    <Card>
      <Copy>
        Account deletion is permanent. Your profile, travel plans, saved places, reviews and
        authored messages will be erased. Transfer ownership of any communities first.
      </Copy>
      <Field
        label="Type DELETE to confirm"
        value={confirmation}
        onChangeText={setConfirmation}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      {!!mutation.error && <Copy error>{mutation.error}</Copy>}
      <Button
        title="Permanently delete my account"
        disabled={confirmation !== 'DELETE' || mutation.busy}
        onPress={() => void mutation.run(deleteMyAccount)}
      />
      <Button
        title="Cancel"
        secondary
        disabled={mutation.busy}
        onPress={() => {
          setOpen(false);
          setConfirmation('');
        }}
      />
    </Card>
  );
}
export default function Profile() {
  const { session } = useAuth();
  const id = session!.user.id;
  const resource = useResource(useCallback(() => getProfile(id), [id]));
  const mutation = useMutation();
  return (
    <Page title="Your profile">
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <>
          <Copy error>{resource.error}</Copy>
          <Button title="Retry" onPress={() => void resource.reload()} />
        </>
      ) : (
        <ProfileForm
          profile={resource.data}
          id={id}
          initialName={String(session?.user.user_metadata.full_name ?? '')}
        />
      )}
      {!!mutation.error && <Copy error>{mutation.error}</Copy>}
      <Copy>{session!.user.email}</Copy>
      <Button
        title="Sign out"
        secondary
        disabled={mutation.busy}
        onPress={() =>
          void mutation.run(async () => {
            const { error } = await database().auth.signOut();
            if (error) throw error;
          })
        }
      />
      <DeleteAccount />
    </Page>
  );
}
