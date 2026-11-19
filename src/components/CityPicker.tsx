import { useEffect, useRef, useState } from 'react';
import {
  createCity,
  importLocation,
  searchCities,
  searchLocations,
  type City,
  type SearchResult,
} from '../lib/data';
import { useMutation } from '../lib/useResource';
import { Button, Copy, Field, Loading } from './ui';
export default function CityPicker({
  value,
  onChange,
}: {
  value: City | null;
  onChange: (city: City | null) => void;
}) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<City[]>([]);
  const [external, setExternal] = useState<{ cacheId: string; results: SearchResult[] } | null>(
    null,
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const mutation = useMutation();
  const sequence = useRef(0);
  useEffect(() => {
    if (value || term.trim().length < 2) return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      void searchCities(term)
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
  }, [term, value]);
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  if (value)
    return (
      <>
        <Copy>{value.name}</Copy>
        <Button
          title="Change city"
          secondary
          disabled={mutation.busy}
          onPress={() => {
            sequence.current++;
            onChange(null);
            setTerm('');
            setResults([]);
            setExternal(null);
            setError('');
            setLoading(false);
          }}
        />
      </>
    );
  return (
    <>
      <Field
        label="City and country"
        value={term}
        maxLength={150}
        editable={!mutation.busy}
        onChangeText={(text) => {
          sequence.current++;
          setTerm(text);
          setResults([]);
          setExternal(null);
          setError('');
          setLoading(false);
        }}
        placeholder="Berlin, Germany"
      />
      {loading && <Loading />}
      {!!error && <Copy error>{error}</Copy>}
      {!!mutation.error && <Copy error>{mutation.error}</Copy>}
      {results.map((city) => (
        <Button
          key={city.id}
          title={city.name}
          secondary
          disabled={mutation.busy}
          onPress={() => onChange(city)}
        />
      ))}
      <Button
        title={mutation.busy ? 'Working…' : 'Search cities on OpenStreetMap'}
        secondary
        disabled={mutation.busy || term.trim().length < 2}
        onPress={() =>
          void mutation.run(async () => {
            const request = ++sequence.current;
            const response = await searchLocations('city', term);
            if (request === sequence.current) setExternal(response);
          })
        }
      />
      {external?.results.map((city) => (
        <Button
          key={city.provider_id}
          title={city.name}
          secondary
          disabled={mutation.busy}
          onPress={() =>
            void mutation.run(async () =>
              onChange(await importLocation(external.cacheId, city.provider_id)),
            )
          }
        />
      ))}
      {external?.results.length === 0 && <Copy>No cities found. Try a city and country.</Copy>}
      {external && <Copy>Search data © OpenStreetMap contributors (ODbL).</Copy>}
      <Button
        title={`Use custom city${term.trim() ? ` “${term.trim()}”` : ''}`}
        secondary
        disabled={mutation.busy || term.trim().length < 2}
        onPress={() => void mutation.run(async () => onChange(await createCity(term)))}
      />
      <Copy>
        Custom cities work for travel plans, but need a verified location before appearing on the
        map.
      </Copy>
    </>
  );
}
