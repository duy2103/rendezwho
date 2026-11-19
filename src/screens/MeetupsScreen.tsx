import { useCallback, useState } from 'react';
import { useAuth } from '../providers/AuthProvider';
import { listCommunities } from '../lib/data';
import { listMeetups, saveMeetup, rsvp, cancelMeetup, type Meetup } from '../lib/meetups';
import { useMutation, useResource } from '../lib/useResource';
import { Button, Card, Copy, Field, Heading, Loading, Page } from '../components/ui';
import SafetyActions from '../components/SafetyActions';
import Sheet from '../components/Sheet';
export default function MeetupsScreen() {
  const userId = useAuth().session!.user.id;
  const [limit, setLimit] = useState(50);
  const resource = useResource(useCallback(() => listMeetups(undefined, limit), [limit]));
  const groups = useResource(useCallback(() => listCommunities(userId), [userId]));
  const mutation = useMutation();
  const [form, setForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [group, setGroup] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [venue, setVenue] = useState('');
  const [starts, setStarts] = useState('');
  const [ends, setEnds] = useState('');
  const [zone, setZone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [capacity, setCapacity] = useState('10');
  const [cancel, setCancel] = useState<string | null>(null);
  function edit(item?: Meetup) {
    setEditing(item?.id ?? null);
    setGroup(item?.community_id ?? groups.data?.[0]?.id ?? '');
    setTitle(item?.title ?? '');
    setDescription(item?.description ?? '');
    setVenue(item?.venue ?? '');
    setStarts(item ? new Date(item.starts_at).toISOString().replace(/\.\d{3}Z$/, 'Z') : '');
    setEnds(item ? new Date(item.ends_at).toISOString().replace(/\.\d{3}Z$/, 'Z') : '');
    setZone(item?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
    setCapacity(String(item?.capacity ?? 10));
    setForm(true);
  }
  return (
    <Page
      title="Community meetups"
      onRefresh={() => void resource.reload()}
      refreshing={resource.loading}
    >
      <Copy>
        Meet people from your trusted communities. Venues and attendance are visible to community
        members.
      </Copy>
      {!!resource.error && <Copy error>{resource.error}</Copy>}
      {!!groups.error && <Copy error>{groups.error}</Copy>}
      {!!mutation.error && <Copy error>{mutation.error}</Copy>}
      {resource.loading && !resource.data && <Loading />}
      <Button title="Host a meetup" disabled={!groups.data?.length} onPress={() => edit()} />
      {groups.data?.length === 0 && <Copy>Join a community to host or attend a meetup.</Copy>}
      {resource.data?.length === 0 && <Copy>No upcoming meetups yet.</Copy>}
      {resource.data?.map((item) => (
        <Card key={item.id}>
          <Heading>{item.title}</Heading>
          <Copy>{groups.data?.find((g) => g.id === item.community_id)?.name ?? 'Community'}</Copy>
          <Copy>
            {new Date(item.starts_at).toLocaleString(undefined, { timeZone: item.timezone })} –{' '}
            {new Date(item.ends_at).toLocaleString(undefined, { timeZone: item.timezone })} (
            {item.timezone})
          </Copy>
          <Copy>{item.venue}</Copy>
          <Copy>{item.description}</Copy>
          <Copy>
            {item.rsvps.length}/{item.capacity} attending{item.cancelled_at ? ' · Cancelled' : ''}
          </Copy>
          {!item.cancelled_at && (
            <Button
              title={item.rsvps.some((r) => r.user_id === userId) ? 'Cancel my RSVP' : 'RSVP'}
              disabled={
                mutation.busy ||
                (!item.rsvps.some((r) => r.user_id === userId) &&
                  item.rsvps.length >= item.capacity)
              }
              onPress={() =>
                void mutation.run(async () => {
                  await rsvp(item.id, !item.rsvps.some((r) => r.user_id === userId));
                  await resource.reload();
                })
              }
            />
          )}
          {item.host_id === userId && !item.cancelled_at && (
            <>
              <Button title="Edit meetup" secondary onPress={() => edit(item)} />
              {cancel === item.id && (
                <Copy>Cancel this meetup? Attendees will receive an in-app notification.</Copy>
              )}
              <Button
                title={cancel === item.id ? 'Confirm cancellation' : 'Cancel meetup'}
                secondary
                disabled={mutation.busy}
                onPress={() => {
                  if (cancel !== item.id) {
                    setCancel(item.id);
                    return;
                  }
                  void mutation.run(async () => {
                    await cancelMeetup(item.id);
                    setCancel(null);
                    await resource.reload();
                  });
                }}
              />
              {cancel === item.id && (
                <Button title="Keep meetup" secondary onPress={() => setCancel(null)} />
              )}
            </>
          )}
          {item.host_id !== userId && (
            <SafetyActions
              kind="meetup"
              target={item.id}
              userId={item.host_id}
              onChanged={resource.reload}
            />
          )}
        </Card>
      ))}
      {resource.data?.length === limit && (
        <Button title="Load more meetups" secondary onPress={() => setLimit(limit + 50)} />
      )}
      <Sheet
        visible={form}
        onClose={() => {
          if (!mutation.busy) setForm(false);
        }}
        title={editing ? 'Edit meetup' : 'Host a meetup'}
      >
        {!editing &&
          groups.data?.map((g) => (
            <Button
              key={g.id}
              title={`${group === g.id ? '✓ ' : ''}${g.name}`}
              secondary
              onPress={() => setGroup(g.id)}
            />
          ))}
        <Field label="Title" value={title} onChangeText={setTitle} maxLength={120} />
        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={3000}
        />
        <Field
          label="Venue / meeting point"
          value={venue}
          onChangeText={setVenue}
          maxLength={300}
        />
        <Copy>
          Include the UTC offset in your times, for example 2027-01-15T18:00+01:00. The timezone
          controls how this event is displayed.
        </Copy>
        <Field
          label="Starts"
          value={starts}
          onChangeText={setStarts}
          autoCapitalize="none"
          placeholder="2027-01-15T18:00+01:00"
        />
        <Field
          label="Ends"
          value={ends}
          onChangeText={setEnds}
          autoCapitalize="none"
          placeholder="2027-01-15T20:00+01:00"
        />
        <Field
          label="Timezone"
          value={zone}
          onChangeText={setZone}
          autoCapitalize="none"
          placeholder="Europe/Berlin"
        />
        <Field
          label="Capacity (1–500, including you if you RSVP)"
          value={capacity}
          onChangeText={setCapacity}
          keyboardType="number-pad"
        />
        {!!mutation.error && <Copy error>{mutation.error}</Copy>}
        <Button
          title="Save meetup"
          disabled={mutation.busy || !group || !title.trim() || !venue.trim()}
          onPress={() =>
            void mutation.run(async () => {
              await saveMeetup({
                target: editing,
                group_id: group,
                title,
                description,
                venue,
                starts,
                ends,
                zone,
                capacity: Number(capacity),
              });
              setForm(false);
              await resource.reload();
            })
          }
        />
      </Sheet>
    </Page>
  );
}
