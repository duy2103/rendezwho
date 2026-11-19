import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '../providers/AuthProvider';
import { listSaved } from '../lib/data';
import { hasCoordinates, type MapPoint } from '../lib/mapData';
import { useResource } from '../lib/useResource';
import { Button, Card, Copy, Field, Heading, Loading, Page } from '../components/ui';
import SavePlaceSheet from '../components/SavePlaceSheet';
import PlaceDetails from '../components/PlaceDetails';
import Sheet from '../components/Sheet';
import WorldMap from '../components/WorldMap';
export default function Saved() {
  const id = useAuth().session!.user.id;
  const [limit, setLimit] = useState(50);
  const resource = useResource(useCallback(() => listSaved(id, limit), [id, limit]));
  const [form, setForm] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'want_to_go' | 'visited'>('all');
  const [map, setMap] = useState(false);
  const filtered = useMemo(
    () =>
      (resource.data ?? []).filter(
        (item) =>
          (status === 'all' || item.status === status) &&
          [item.name, item.city, item.place?.category, item.place?.address]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
      ),
    [resource.data, status, query],
  );
  const points = useMemo(
    () =>
      filtered.flatMap((item) =>
        item.place && hasCoordinates(item.place)
          ? [
              {
                id: item.id,
                name: item.name,
                kind: 'place' as const,
                longitude: item.place.longitude,
                latitude: item.place.latitude,
              },
            ]
          : [],
      ),
    [filtered],
  ) satisfies MapPoint[];
  const item = resource.data?.find((row) => row.id === selected);
  return (
    <Page
      title="My places"
      subtitle="Your private wish list and places you have visited."
      onRefresh={resource.reload}
      refreshing={resource.loading && !!resource.data}
    >
      <Button title="Save a place" onPress={() => setForm(true)} />
      <Field
        label="Filter loaded places by name, city or category"
        value={query}
        onChangeText={setQuery}
      />
      {(['all', 'want_to_go', 'visited'] as const).map((value) => (
        <Button
          key={value}
          title={`${status === value ? '✓ ' : ''}${value === 'all' ? 'All' : value === 'visited' ? 'Visited' : 'Want to go'}`}
          secondary
          onPress={() => setStatus(value)}
        />
      ))}
      <Button
        title={map ? 'Show list only' : 'Show map and list'}
        secondary
        onPress={() => setMap(!map)}
      />
      {map && <WorldMap points={points} onSelect={setSelected} />}
      {resource.loading && <Loading />}
      {!!resource.error && (
        <>
          <Copy error>{resource.error}</Copy>
          <Button title="Retry" secondary onPress={() => void resource.reload()} />
        </>
      )}
      {!resource.loading && filtered.length === 0 && (
        <Copy>No saved places match. Save a place or change the filters.</Copy>
      )}
      {filtered.map((row) => (
        <Card key={row.id}>
          <Heading>{row.name}</Heading>
          <Copy>
            {row.city} · {row.status === 'visited' ? 'Visited' : 'Want to go'}
          </Copy>
          {!!row.note && <Copy>{row.note}</Copy>}
          {(!row.place || !hasCoordinates(row.place)) && <Copy>Location not set</Copy>}
          <Button title="Open place" secondary onPress={() => setSelected(row.id)} />
        </Card>
      ))}
      {resource.data?.length === limit && (
        <Button
          title="Load more places"
          secondary
          disabled={resource.loading}
          onPress={() => setLimit(limit + 50)}
        />
      )}
      {form && <SavePlaceSheet onClose={() => setForm(false)} onSaved={resource.reload} />}
      {item && (
        <Sheet title="Place details" visible onClose={() => setSelected(null)}>
          {item.place ? (
            <PlaceDetails
              key={item.id}
              city={{ id: item.city_id, name: item.city, region: '', country_code: null }}
              place={item.place}
              saved={item}
              onChanged={resource.reload}
            />
          ) : (
            <Copy>Place details are unavailable. Refresh and try again.</Copy>
          )}
        </Sheet>
      )}
    </Page>
  );
}
