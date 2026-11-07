import { useCallback, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { MapPin, ShieldCheck, Users } from 'lucide-react-native';
import { useAuth } from '../providers/AuthProvider';
import {
  deleteOwned,
  listCommunities,
  listTrips,
  saveTrip,
  type City,
  type Trip,
} from '../lib/data';
import { useMutation, useResource } from '../lib/useResource';
import { localDate } from '../lib/travel';
import CityPicker from '../components/CityPicker';
import Sheet from '../components/Sheet';
import { Button, Card, Copy, Eyebrow, Field, Heading, Loading, Page } from '../components/ui';
import { colors, fonts } from '../theme/tokens';
export default function Trips() {
  const id = useAuth().session!.user.id;
  const { add } = useLocalSearchParams<{ add?: string }>();
  const resource = useResource(useCallback(() => listTrips(id), [id]));
  const communities = useResource(useCallback(() => listCommunities(id), [id]));
  const mutation = useMutation();
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [form, setForm] = useState(false);
  const [editing, setEditing] = useState<string>();
  const [city, setCity] = useState<City | null>(null);
  const [arrival, setArrival] = useState('');
  const [departure, setDeparture] = useState('');
  const [note, setNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dismissedAdd, setDismissedAdd] = useState<string>();
  const showForm = form || (!!add && add !== dismissedAdd);
  const upcoming = resource.data?.filter((t) => t.departure >= localDate()) ?? [];
  function clear() {
    setDismissedAdd(add);
    setForm(false);
    setEditing(undefined);
    setCity(null);
    setArrival('');
    setDeparture('');
    setNote('');
    setGroupIds([]);
    setConfirmDelete(false);
  }
  function edit(trip: Trip) {
    setEditing(trip.id);
    setCity({ id: trip.city_id, name: trip.city, region: '', country_code: null });
    setArrival(trip.arrival);
    setDeparture(trip.departure);
    setNote(trip.note);
    setGroupIds(trip.group_ids);
    setConfirmDelete(false);
    setForm(true);
  }
  return (
    <Page
      title="My travels"
      subtitle="A private record of everywhere you have been."
      onRefresh={resource.reload}
      refreshing={resource.loading && !!resource.data}
    >
      {resource.loading && !resource.data && <Loading />}
      {!!resource.error && <Copy error>{resource.error}</Copy>}
      <View style={s.row}>
        {[
          [new Set(resource.data?.map((t) => t.city_id)).size, 'Cities'],
          [upcoming.length, 'Upcoming'],
          [resource.data?.filter((t) => t.departure < localDate()).length ?? 0, 'Visited'],
        ].map(([value, label]) => (
          <Card key={label} style={s.stat}>
            <Text style={s.number}>{value}</Text>
            <Text style={s.label}>{label}</Text>
          </Card>
        ))}
      </View>
      <Button
        title="Log a trip"
        onPress={() => {
          clear();
          setForm(true);
        }}
      />
      <View style={{ gap: 12 }}>
        <Eyebrow>Shared itineraries</Eyebrow>
        <Heading>Active & upcoming</Heading>
        <View style={s.row}>
          <ShieldCheck size={13} color={colors.tealDeep} />
          <Text style={s.meta}>You control visibility</Text>
        </View>
        {upcoming.length === 0 && !resource.loading && (
          <Card>
            <Copy>No upcoming trips yet. Add your next destination.</Copy>
          </Card>
        )}
        {upcoming.map((trip) => (
          <Card key={trip.id}>
            <View style={s.row}>
              <View style={s.pin}>
                <MapPin size={18} color={colors.tealDeep} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{trip.city}</Text>
                <Copy>
                  {trip.arrival} – {trip.departure}
                </Copy>
              </View>
            </View>
            <View style={s.footer}>
              <Users size={13} color={colors.tealDeep} />
              <Text style={s.meta}>
                {trip.group_ids.length
                  ? `${trip.group_ids.length} ${trip.group_ids.length === 1 ? 'group' : 'groups'}`
                  : 'Private'}
              </Text>
            </View>
            <Button title="Manage visibility →" secondary onPress={() => edit(trip)} />
          </Card>
        ))}
      </View>
      <Card>
        <Heading>Travel timeline</Heading>
        {resource.data?.length === 0 && <Copy>Your travel story starts here.</Copy>}
        {resource.data?.map((trip) => (
          <View key={trip.id} style={s.timeline}>
            <View style={s.row}>
              <MapPin size={18} color={colors.tealDeep} />
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{trip.city}</Text>
                <Copy>
                  {trip.arrival} – {trip.departure}
                </Copy>
              </View>
            </View>
            <Button title="View trip" secondary onPress={() => edit(trip)} />
          </View>
        ))}
        {resource.data?.length === 100 && <Copy>Showing your latest 100 trips.</Copy>}
      </Card>
      <Sheet
        title={editing ? 'Manage check-in' : 'Add check-in'}
        visible={showForm}
        onClose={() => {
          if (!mutation.busy) clear();
        }}
      >
        <CityPicker value={city} onChange={setCity} />
        <Field
          label="Arriving (YYYY-MM-DD)"
          value={arrival}
          onChangeText={setArrival}
          maxLength={10}
          placeholder="2026-12-01"
        />
        <Field
          label="Leaving (YYYY-MM-DD)"
          value={departure}
          onChangeText={setDeparture}
          maxLength={10}
          placeholder="2026-12-07"
        />
        <Field label="Notes" value={note} onChangeText={setNote} multiline maxLength={1000} />
        <Eyebrow>Who can see this?</Eyebrow>
        <Copy>Share with communities. Select none to keep this trip private.</Copy>
        {communities.loading && <Loading />}
        {!!communities.error && <Copy error>{communities.error}</Copy>}
        {communities.data?.map((group) => (
          <Button
            key={group.id}
            title={`${groupIds.includes(group.id) ? '✓ ' : ''}${group.name}`}
            secondary
            disabled={mutation.busy}
            onPress={() =>
              setGroupIds((current) =>
                current.includes(group.id)
                  ? current.filter((g) => g !== group.id)
                  : [...current, group.id],
              )
            }
          />
        ))}
        {groupIds.some((group) => !communities.data?.some((g) => g.id === group)) && (
          <>
            <Copy>Some existing shares are no longer available. Remove them before saving.</Copy>
            <Button
              title="Remove unavailable shares"
              secondary
              onPress={() =>
                setGroupIds((current) =>
                  current.filter((group) => communities.data?.some((g) => g.id === group)),
                )
              }
            />
          </>
        )}
        {!!mutation.error && <Copy error>{mutation.error}</Copy>}
        <Button
          title={mutation.busy ? 'Saving…' : 'Save check-in'}
          disabled={mutation.busy || !city}
          onPress={() =>
            void mutation.run(async () => {
              if (!city) return;
              await saveTrip(id, city, arrival, departure, note, editing, groupIds);
              clear();
              await resource.reload();
            })
          }
        />
        {editing &&
          (confirmDelete ? (
            <>
              <Copy>Delete this check-in and its shares? This cannot be undone.</Copy>
              <Button
                title="Confirm delete"
                disabled={mutation.busy}
                onPress={() =>
                  void mutation.run(async () => {
                    await deleteOwned('check_ins', editing, id);
                    clear();
                    await resource.reload();
                  })
                }
              />
              <Button title="Keep trip" secondary onPress={() => setConfirmDelete(false)} />
            </>
          ) : (
            <Button title="Delete check-in" secondary onPress={() => setConfirmDelete(true)} />
          ))}
      </Sheet>
    </Page>
  );
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', padding: 16 },
  number: { fontFamily: fonts.serif, fontSize: 32, color: colors.tealDeep },
  label: { fontFamily: fonts.bold, fontSize: 10, color: colors.muted, textTransform: 'uppercase' },
  pin: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  meta: { fontFamily: fonts.bold, fontSize: 10, color: colors.tealDeep },
  footer: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 16,
  },
  timeline: { borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 16, gap: 12 },
});
