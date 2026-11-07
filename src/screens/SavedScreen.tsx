import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Bookmark, Coffee } from 'lucide-react-native';
import Sheet from '../components/Sheet';
import { colors, fonts } from '../theme/tokens';
import { useAuth } from '../providers/AuthProvider';
import {
  deleteOwned,
  listSaved,
  savePlace,
  searchPlaces,
  type City,
  type Place,
} from '../lib/data';
import { useMutation, useResource } from '../lib/useResource';
import CityPicker from '../components/CityPicker';
import { Button, Card, Copy, Field, Loading, Page } from '../components/ui';
export default function Saved() {
  const id = useAuth().session!.user.id;
  const resource = useResource(useCallback(() => listSaved(id), [id]));
  const mutation = useMutation();
  const [removing, setRemoving] = useState<string | null>(null);
  const [form, setForm] = useState(false);
  const [city, setCity] = useState<City | null>(null);
  const [term, setTerm] = useState('');
  const [place, setPlace] = useState<Place | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!city?.id || term.trim().length < 2) return;
    let active = true;
    const timer = setTimeout(() => {
      searchPlaces(city.id, term)
        .then((rows) => {
          if (active) setPlaces(rows);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [city, term]);
  return (
    <Page
      title="My places"
      subtitle="Everything you want to visit, saved, or reviewed."
      onRefresh={resource.reload}
      refreshing={resource.loading && !!resource.data}
    >
      <Button title="Save a place" onPress={() => setForm(true)} />
      {!!mutation.error && <Copy error>{mutation.error}</Copy>}
      <Sheet
        title="Save a place"
        visible={form}
        onClose={() => {
          if (!mutation.busy) setForm(false);
        }}
      >
        <CityPicker
          value={city}
          onChange={(value) => {
            setCity(value);
            setPlace(null);
            setPlaces([]);
            setError('');
          }}
        />
        {city && (
          <>
            <Field
              label="Place name"
              maxLength={200}
              value={term}
              onChangeText={(text) => {
                setTerm(text);
                setPlace(null);
                setPlaces([]);
                setError('');
              }}
            />
            <Copy>
              {place
                ? `Selected: ${place.name}`
                : 'Choose a suggestion or use the place name you entered.'}
            </Copy>
            {term.trim().length >= 1 && (
              <Button
                title={`Use “${term.trim()}”`}
                secondary
                onPress={() =>
                  setPlace({
                    id: '',
                    city_id: city.id,
                    name: term.trim(),
                    address: '',
                    category: null,
                  })
                }
              />
            )}
            {places.map((item) => (
              <Button
                key={item.id}
                title={[item.name, item.address].filter(Boolean).join(' · ')}
                secondary
                onPress={() => setPlace(item)}
              />
            ))}
            {!!error && <Copy error>{error}</Copy>}
          </>
        )}
        <Field label="Notes" value={note} onChangeText={setNote} multiline maxLength={1000} />
        <Button
          title="Save place"
          disabled={!city || !place || mutation.busy}
          onPress={() =>
            void mutation.run(async () => {
              if (!city || !place) return;
              await savePlace(id, city, place, note);
              setForm(false);
              setCity(null);
              setPlace(null);
              setTerm('');
              setNote('');
              await resource.reload();
            })
          }
        />
        <Button title="Cancel" secondary disabled={mutation.busy} onPress={() => setForm(false)} />
      </Sheet>
      {resource.loading && <Loading />}
      {!!resource.error && <Copy error>{resource.error}</Copy>}
      {resource.data?.length === 0 && <Copy>Your saved places will appear here.</Copy>}
      {resource.data?.map((item) => (
        <Card key={item.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                backgroundColor: colors.soft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Coffee size={19} color={colors.tealDeep} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.ink }}>
                {item.name}
              </Text>
              <Copy>{item.city}</Copy>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${item.name} from wish list`}
              onPress={() => setRemoving(item.id)}
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: colors.soft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Bookmark size={18} color={colors.tealDeep} fill={colors.soft} />
            </Pressable>
          </View>
          {!!item.note && <Copy>{item.note}</Copy>}
          {removing === item.id ? (
            <>
              <Copy>Remove this place from your wish list?</Copy>
              <Button
                title="Confirm removal"
                disabled={mutation.busy}
                onPress={() =>
                  void mutation.run(async () => {
                    await deleteOwned('saved_places', item.id, id);
                    setRemoving(null);
                    await resource.reload();
                  })
                }
              />
              <Button title="Keep place" secondary onPress={() => setRemoving(null)} />
            </>
          ) : null}
        </Card>
      ))}
    </Page>
  );
}
