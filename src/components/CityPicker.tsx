import { useEffect, useState } from 'react';
import { searchCities, type City } from '../lib/data';
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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (value || term.trim().length < 2) return;
    let active = true;
    const timer = setTimeout(() => {
      searchCities(term.trim())
        .then((data) => {
          if (active) setResults(data);
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
  if (value)
    return (
      <>
        <Copy>
          {value.name}
          {value.country_code ? `, ${value.country_code}` : ''}
        </Copy>
        <Button
          title="Change city"
          secondary
          onPress={() => {
            onChange(null);
            setTerm('');
          }}
        />
      </>
    );
  return (
    <>
      <Field
        label="City and country"
        value={term}
        onChangeText={(text) => {
          setTerm(text);
          setResults([]);
          setError('');
          setLoading(text.trim().length >= 2);
        }}
        placeholder="For example, Berlin, Germany"
        maxLength={150}
      />
      {term.trim().length >= 2 && (
        <Button
          title={`Use “${term.trim()}”`}
          secondary
          onPress={() => onChange({ id: '', name: term.trim(), country_code: null, region: '' })}
        />
      )}
      {loading && <Loading />}
      {!!error && <Copy error>{error}</Copy>}
      {results.map((city) => (
        <Button
          key={city.id}
          title={[city.name, city.region, city.country_code].filter(Boolean).join(', ')}
          secondary
          onPress={() => onChange(city)}
        />
      ))}
      {!loading && !error && term.length >= 2 && results.length === 0 && (
        <Copy>No suggestions yet. You can use the city and country entered above.</Copy>
      )}
    </>
  );
}
