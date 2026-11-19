import ConnectionAction from '../components/ConnectionAction';
import SafetyActions from '../components/SafetyActions';
import { useCallback, useMemo, useState } from 'react';
import CityPicker from '../components/CityPicker';
import { useAuth } from '../providers/AuthProvider';
import { listNetworkTrips, listSaved, listConnections, type City } from '../lib/data';
import { cityPoints, hasCoordinates, type MapPoint } from '../lib/mapData';
import { validateDates } from '../lib/validation';
import { localDate } from '../lib/travel';
import { useMutation, useResource } from '../lib/useResource';
import { Button, Card, Copy, Field, Heading, Loading, Page } from '../components/ui';
import WorldMap from '../components/WorldMap';
import Sheet from '../components/Sheet';
import SavePlaceSheet from '../components/SavePlaceSheet';
import PlaceDetails from '../components/PlaceDetails';
export default function MapScreen() {
  const id = useAuth().session!.user.id;
  const saved = useResource(useCallback(() => listSaved(id, 100), [id]));
  const mutation = useMutation();
  const connections = useResource(useCallback(() => listConnections(id), [id]));
  const [mode, setMode] = useState<'now' | 'upcoming' | 'range'>('upcoming');
  const [start, setStart] = useState(localDate());
  const [end, setEnd] = useState(localDate());
  const [layer, setLayer] = useState<'people' | 'places'>('people');
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addingCity, setAddingCity] = useState<City | undefined>();
  const [locatingCity, setLocatingCity] = useState(false);
  const [currentCity, setCurrentCity] = useState<City | null>(null);
  const [center, setCenter] = useState<[number, number] | undefined>();
  const rangeError = useMemo(() => {
    if (mode !== 'range') return '';
    try {
      validateDates(start, end);
      return '';
    } catch (e) {
      return (e as Error).message;
    }
  }, [mode, start, end]);
  const resource = useResource(
    useCallback(
      () =>
        listNetworkTrips(
          id,
          mode === 'range' && !rangeError ? start : localDate(),
          mode === 'range' && !rangeError ? end : mode === 'now' ? localDate() : undefined,
        ),
      [id, mode, start, end, rangeError],
    ),
  );
  const trips = useMemo(
    () =>
      (resource.data ?? []).filter((t) =>
        mode === 'now'
          ? t.arrival <= localDate() && t.departure >= localDate()
          : mode === 'range'
            ? !rangeError && t.arrival <= end && t.departure >= start
            : true,
      ),
    [resource.data, mode, start, end, rangeError],
  );
  const points = useMemo(
    () =>
      layer === 'people'
        ? cityPoints(trips)
        : (saved.data ?? []).flatMap((item) =>
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
    [layer, trips, saved.data],
  ) satisfies MapPoint[];
  const selectedTrips = layer === 'people' ? trips.filter((t) => t.city_id === selected) : [];
  const city = selectedTrips[0]?.location;
  const place = layer === 'places' ? saved.data?.find((p) => p.id === selected) : undefined;
  const reload = async () => {
    await Promise.all([resource.reload(), saved.reload()]);
  };
  return (
    <Page
      title="Explore map"
      subtitle="Shared travel plans at city level, and your private saved places."
      onRefresh={reload}
    >
      <Button
        title={layer === 'people' ? 'Show my saved places' : 'Show people'}
        secondary
        onPress={() => {
          setLayer(layer === 'people' ? 'places' : 'people');
          setSelected(null);
          setCenter(undefined);
        }}
      />
      {layer === 'people' && (
        <>
          {(['now', 'upcoming', 'range'] as const).map((value) => (
            <Button
              key={value}
              title={`${mode === value ? '✓ ' : ''}${value === 'now' ? 'Here now' : value === 'upcoming' ? 'Current & upcoming' : 'Date range'}`}
              secondary
              onPress={() => setMode(value)}
            />
          ))}
          {mode === 'range' && (
            <>
              <Field
                label="From (YYYY-MM-DD)"
                value={start}
                onChangeText={setStart}
                maxLength={10}
              />
              <Field
                label="Through (YYYY-MM-DD)"
                value={end}
                onChangeText={setEnd}
                maxLength={10}
              />
              {!!rangeError && <Copy error>{rangeError}</Copy>}
            </>
          )}
          <Copy>
            {new Set(trips.map((t) => t.user_id)).size} people ·{' '}
            {new Set(trips.map((t) => t.city_id)).size} cities
          </Copy>
        </>
      )}
      {!adding && <WorldMap points={points} center={center} onSelect={setSelected} />}
      <Button title="Use current city" secondary onPress={() => setLocatingCity(true)} />
      {currentCity && <Copy>Selected city: {currentCity.name}</Copy>}
      {locatingCity && (
        <Sheet title="Choose your current city" visible onClose={() => setLocatingCity(false)}>
          <CityPicker
            value={null}
            onChange={(chosen) => {
              if (!chosen) return;
              setCurrentCity(chosen);
              if (hasCoordinates(chosen)) setCenter([chosen.longitude, chosen.latitude]);
              setLocatingCity(false);
            }}
          />
        </Sheet>
      )}
      {!!mutation.error && <Copy error>{mutation.error}</Copy>}
      <Button
        title="Find and save a place"
        onPress={() => {
          setAddingCity(currentCity ?? undefined);
          setAdding(true);
        }}
      />
      {(resource.loading || saved.loading) && <Loading />}
      {!!resource.error && <Copy error>{resource.error}</Copy>}
      {!!saved.error && <Copy error>{saved.error}</Copy>}
      {!!(resource.error || saved.error) && (
        <Button title="Retry" secondary onPress={() => void reload()} />
      )}
      {layer === 'people' && (
        <>
          {trips.length === 0 && !resource.loading && (
            <Copy>No shared trips match these dates.</Copy>
          )}
          {[...new Set(trips.map((t) => t.city_id))].map((cityId) => {
            const group = trips.filter((t) => t.city_id === cityId);
            return (
              <Card key={cityId}>
                <Heading>{group[0].city}</Heading>
                <Copy>{new Set(group.map((t) => t.user_id)).size} travelers</Copy>
                {(!group[0].location || !hasCoordinates(group[0].location)) && (
                  <Copy>City coordinates not set; available in this list.</Copy>
                )}
                <Button title="Open city" secondary onPress={() => setSelected(cityId)} />
              </Card>
            );
          })}
          {resource.data?.length === 100 && (
            <Copy>Showing the first 100 matching visible trips.</Copy>
          )}
        </>
      )}
      {layer === 'places' && (
        <>
          {saved.data?.map((item) => (
            <Button
              key={item.id}
              title={`${item.name} · ${item.city}`}
              secondary
              onPress={() => setSelected(item.id)}
            />
          ))}
          {saved.data?.length === 100 && (
            <Copy>Showing 100 saved places. Open My places to load more.</Copy>
          )}
        </>
      )}
      {selectedTrips.length > 0 && (
        <Sheet title={selectedTrips[0].city} visible onClose={() => setSelected(null)}>
          <Copy>These are city-level travel plans, not live locations.</Copy>
          {!!mutation.error && <Copy error>{mutation.error}</Copy>}
          {selectedTrips.map((t) => (
            <Card key={t.id}>
              <Heading>{t.full_name}</Heading>
              <Copy>
                {t.arrival} – {t.departure}
              </Copy>
              <ConnectionAction
                userId={t.user_id}
                currentUserId={id}
                connection={connections.data?.find(
                  (c) => c.sender_id === t.user_id || c.recipient_id === t.user_id,
                )}
                onChanged={connections.reload}
              />
              <SafetyActions
                kind="profile"
                target={t.user_id}
                userId={t.user_id}
                onChanged={resource.reload}
              />
            </Card>
          ))}
          <Button
            title="Find places in this city"
            onPress={() => {
              setAddingCity(city ?? undefined);
              setAdding(true);
              setSelected(null);
            }}
          />
        </Sheet>
      )}
      {place?.place && (
        <Sheet title="Place details" visible onClose={() => setSelected(null)}>
          <PlaceDetails
            key={place.id}
            saved={place}
            place={place.place}
            city={{ id: place.city_id, name: place.city, region: '', country_code: null }}
            onChanged={saved.reload}
          />
        </Sheet>
      )}
      {adding && (
        <SavePlaceSheet
          initialCity={addingCity}
          onClose={() => setAdding(false)}
          onSaved={saved.reload}
        />
      )}
    </Page>
  );
}
