import { useEffect, useRef, useState } from 'react';
import {
  importLocation,
  savePlace,
  searchLocations,
  searchPlaces,
  type City,
  type Place,
  type SearchResult,
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
  const [external, setExternal] = useState<{ cacheId: string; results: SearchResult[] } | null>(
    null,
  );
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
    }, 300);
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
            label="Place name"
            value={term}
            maxLength={200}
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
                setPlace(item);
                setCustom(false);
              }}
            />
          ))}
          <Button
            title="Search more places near this city"
            secondary
            disabled={mutation.busy || term.trim().length < 2 || !hasCoordinates(city)}
            onPress={() =>
              void mutation.run(async () => {
                const request = ++sequence.current;
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
          {external?.results.map((item) => (
            <Button
              key={item.provider_id}
              title={[item.name, item.address].filter(Boolean).join(' · ')}
              secondary
              disabled={mutation.busy}
              onPress={() =>
                void mutation.run(async () => {
                  setPlace(await importLocation(external.cacheId, item.provider_id, city.id));
                  setCustom(false);
                })
              }
            />
          ))}
          {external?.results.length === 0 && (
            <Copy>No results. Try a different name or add a custom place.</Copy>
          )}
          {external && <Copy>Results near this city · © OpenStreetMap contributors (ODbL).</Copy>}
          <Button
            title="Add a private custom place"
            secondary
            disabled={!term.trim() || mutation.busy}
            onPress={() => {
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
            disabled={mutation.busy || (!place && !custom)}
            onPress={() =>
              void mutation.run(async () => {
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
