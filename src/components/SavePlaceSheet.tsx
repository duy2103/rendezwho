import { Linking, Text, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import {
  importLocation,
  savePlace,
  saveGooglePlace,
  googlePlaceUrl,
  searchLocations,
  searchPlaces,
  type City,
  type Place,
  type SearchResult,
  type SearchResponse,
} from '../lib/data';
import { hasCoordinates } from '../lib/mapData';
import { useMutation } from '../lib/useResource';
import { useAuth } from '../providers/AuthProvider';
import CityPicker from './CityPicker';
import Sheet from './Sheet';
import WorldMap from './WorldMap';
import { Button, Copy, Field, Loading } from './ui';
export default function SavePlaceSheet({
  onClose,
  onSaved,
  initialCity,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
  initialCity?: City;
}) {
  const id = useAuth().session!.user.id;
  const [city, setCity] = useState<City | null>(initialCity ?? null);
  const [term, setTerm] = useState('');
  const [place, setPlace] = useState<Place | null>(null);
  const [results, setResults] = useState<Place[]>([]);
  const [external, setExternal] = useState<SearchResponse | null>(null);
  const [google, setGoogle] = useState<SearchResult | null>(null);
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [pin, setPin] = useState<[number, number] | null>(null);
  const [custom, setCustom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const mutation = useMutation();
  useEffect(() => {
    if (!city || term.trim().length < 2) return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      void searchPlaces(city.id, term)
        .then((rows) => {
          if (active) setResults(rows);
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 800);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [city, term]);
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  function resetResults() {
    sequence.current++;
    setPlace(null);
    setGoogle(null);
    setResults([]);
    setExternal(null);
    setCustom(false);
    setPin(null);
    setError('');
    setLoading(false);
  }
  return (
    <Sheet
      title="Save a place"
      visible
      onClose={() => {
        if (!mutation.busy) onClose();
      }}
    >
      <CityPicker
        value={city}
        onChange={(value) => {
          setCity(value);
          resetResults();
        }}
      />
      {!!mutation.error && <Copy error>{mutation.error}</Copy>}
      {!!error && <Copy error>{error}</Copy>}
      {city && (
        <>
          <Field
            label="Search for a place"
            placeholder="Café, restaurant, or place name"
            value={term}
            maxLength={150}
            editable={!mutation.busy}
            onChangeText={(text) => {
              setTerm(text);
              resetResults();
            }}
          />
          {loading && <Loading />}
          {results.map((item) => (
            <Button
              key={item.id}
              title={[item.name, item.address].filter(Boolean).join(' · ')}
              secondary
              disabled={mutation.busy}
              onPress={() => {
                setGoogle(null);
                setPlace(item);
                setCustom(false);
              }}
            />
          ))}
          <Button
            title={mutation.busy ? 'Searching…' : 'Search places'}
            secondary
            disabled={mutation.busy || loading || term.trim().length < 2 || !hasCoordinates(city)}
            onPress={() =>
              void mutation.run(async () => {
                const request = ++sequence.current;
                setGoogle(null);
                setExternal(null);
                setCustom(false);
                setError('');
                const response = await searchLocations('place', term, city.id);
                if (request === sequence.current) setExternal(response);
              })
            }
          />
          {!hasCoordinates(city) && (
            <Copy>
              Choose a city from OpenStreetMap search for external place search. You can still add a
              custom place.
            </Copy>
          )}
          {external?.provider === 'google' && (
            <Copy>No OpenStreetMap matches available. Results below are from Google Maps.</Copy>
          )}
          {external?.results.map((item) => (
            <View key={item.provider_id} style={{ gap: 8 }}>
              <Button
                title={[item.name, item.address].filter(Boolean).join(' · ')}
                secondary
                disabled={mutation.busy}
                onPress={() =>
                  void mutation.run(async () => {
                    if (external.provider === 'google') {
                      setPlace(null);
                      setGoogle(item);
                      setLabel(term.trim());
                    } else {
                      setGoogle(null);
                      setPlace(await importLocation(external.cacheId, item.provider_id, city.id));
                    }
                    setCustom(false);
                  })
                }
              />
              {item.attributions?.map((attribution, index) => (
                <Text
                  key={index}
                  onPress={
                    attribution.uri ? () => void Linking.openURL(attribution.uri!) : undefined
                  }
                >
                  {attribution.provider}
                </Text>
              ))}
            </View>
          ))}
          {external?.results.length === 0 && (
            <Copy>
              No matching places found. Try just the business name without its address. Some
              businesses are not listed; you can add a private custom place.
            </Copy>
          )}
          {!!external?.notice && <Copy>{external.notice}</Copy>}
          {external &&
            (external.provider === 'google' ? (
              <Text style={{ fontSize: 14, color: '#5E5E5E', fontWeight: '400' }}>Google Maps</Text>
            ) : (
              <Copy>Results near this city · © OpenStreetMap contributors (ODbL).</Copy>
            ))}
          {google && (
            <>
              <Copy>
                Selected: {google.name}. Save a Google Maps link with your own label; this bookmark
                will not have a pin on the map.
              </Copy>
              <Field
                label="Your bookmark label"
                value={label}
                onChangeText={setLabel}
                maxLength={200}
              />
              <Button
                title="Open in Google Maps"
                secondary
                onPress={() =>
                  void mutation.run(async () => {
                    await Linking.openURL(googlePlaceUrl(google.provider_id.slice(7)));
                  })
                }
              />
            </>
          )}
          <Button
            title="Add a private custom place"
            secondary
            disabled={!term.trim() || mutation.busy}
            onPress={() => {
              setGoogle(null);
              setExternal(null);
              setCustom(true);
              setPlace(null);
            }}
          />
          {custom && (
            <>
              <Copy>
                Tap the map to set an optional pin. This place is private unless you later share a
                review.
              </Copy>
              <WorldMap
                center={hasCoordinates(city) ? [city.longitude, city.latitude] : undefined}
                points={
                  pin
                    ? [
                        {
                          id: 'custom',
                          name: term,
                          kind: 'place',
                          longitude: pin[0],
                          latitude: pin[1],
                        },
                      ]
                    : []
                }
                onPick={setPin}
              />
              {pin && (
                <>
                  <Copy>
                    Pin: {pin[1].toFixed(4)}, {pin[0].toFixed(4)}
                  </Copy>
                  <Button title="Remove pin" secondary onPress={() => setPin(null)} />
                </>
              )}
            </>
          )}
          {place && (
            <Copy>
              Selected: {place.name} · {place.address || 'Address unavailable'}
            </Copy>
          )}
          <Field
            label="Private note"
            value={note}
            onChangeText={setNote}
            maxLength={1000}
            multiline
          />
          <Button
            title={mutation.busy ? 'Saving…' : 'Save place'}
            disabled={
              mutation.busy || (!place && !custom && !google) || (!!google && !label.trim())
            }
            onPress={() =>
              void mutation.run(async () => {
                if (google && external) {
                  await saveGooglePlace(external.cacheId, google.provider_id, city.id, label, note);
                  await onSaved();
                  onClose();
                  return;
                }
                const chosen = place ?? {
                  id: '',
                  city_id: city.id,
                  name: term.trim(),
                  address: '',
                  category: null,
                  longitude: pin?.[0] ?? null,
                  latitude: pin?.[1] ?? null,
                };
                await savePlace(id, city, chosen, note);
                await onSaved();
                onClose();
              })
            }
          />
        </>
      )}
      <Button title="Cancel" secondary disabled={mutation.busy} onPress={onClose} />
    </Sheet>
  );
}
