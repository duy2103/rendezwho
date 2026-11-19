import { useState } from 'react';
import { router } from 'expo-router';
import { useAuth } from '../providers/AuthProvider';
import { finishOnboarding } from '../lib/social';
import { useMutation } from '../lib/useResource';
import { type City } from '../lib/data';
import CityPicker from '../components/CityPicker';
import { Button, Card, Copy, Field, Page } from '../components/ui';
export default function OnboardingScreen() {
  const { session } = useAuth();
  const [name, setName] = useState(String(session?.user.user_metadata.full_name ?? ''));
  const [bio, setBio] = useState('');
  const [city, setCity] = useState<City | null>(null);
  const [step, setStep] = useState(1);
  const mutation = useMutation();
  return (
    <Page title={step === 1 ? 'Welcome to Rendezwho' : 'Find your people'} header={false}>
      {step === 1 ? (
        <>
          <Copy>
            Share travel plans with people you trust. Start with the name your communities will see.
          </Copy>
          <Field label="Display name" value={name} onChangeText={setName} maxLength={100} />
          <Field
            label="Bio (optional)"
            value={bio}
            onChangeText={setBio}
            maxLength={1000}
            multiline
          />
          <Copy>Home city (optional)</Copy>
          <CityPicker value={city} onChange={setCity} />
          <Card>
            <Copy>
              Your trips stay private until you choose communities to share them with. Nearby
              matches use cities and overlapping dates, not your live location.
            </Copy>
          </Card>
          {!!mutation.error && <Copy error>{mutation.error}</Copy>}
          <Button
            title="Save and continue"
            disabled={mutation.busy || !name.trim()}
            onPress={() =>
              void mutation.run(async () => {
                await finishOnboarding(name, bio, city?.id ?? null);
                setStep(2);
              })
            }
          />
        </>
      ) : (
        <>
          <Copy>
            Join or create a trusted community, then add your first trip. You can change trip
            visibility at any time.
          </Copy>
          <Button
            title="Join or create a community"
            onPress={() => router.replace('/communities')}
          />
          <Button
            title="Add my first trip"
            onPress={() =>
              router.replace({ pathname: '/trips', params: { add: String(Date.now()) } })
            }
          />
          <Button title="Explore first" secondary onPress={() => router.replace('/')} />
        </>
      )}
    </Page>
  );
}
