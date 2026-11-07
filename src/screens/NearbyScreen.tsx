import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ShieldCheck, Sparkles, Users } from 'lucide-react-native';
import { useAuth } from '../providers/AuthProvider';
import { getProfile, listNetworkTrips, listTrips, requestConnection } from '../lib/data';
import { useMutation, useResource } from '../lib/useResource';
import { initials, overlappingTrips } from '../lib/travel';
import { Button, Card, Copy, Loading, Page } from '../components/ui';
import { colors, fonts } from '../theme/tokens';
export default function NearbyScreen() {
  const id = useAuth().session!.user.id;
  const resource = useResource(
    useCallback(async () => {
      const [profile, own, network] = await Promise.all([
        getProfile(id),
        listTrips(id),
        listNetworkTrips(id),
      ]);
      return { profile, buddies: overlappingTrips(own, network) };
    }, [id]),
  );
  const mutation = useMutation();
  const [pending, setPending] = useState<string[]>([]);
  return (
    <Page
      title="Buddy nearby"
      eyebrow={resource.data?.profile?.home_city || undefined}
      subtitle="People from your trusted groups whose dates overlap with yours."
    >
      <View style={s.badge}>
        <ShieldCheck size={15} color={colors.tealDeep} />
        <Text style={s.badgeText}>City level only</Text>
      </View>
      {resource.loading && <Loading />}
      {!!resource.error && (
        <>
          <Copy error>{resource.error}</Copy>
          <Button title="Try again" secondary onPress={() => void resource.reload()} />
        </>
      )}
      {resource.data && (
        <>
          <Card
            style={{ backgroundColor: colors.soft, flexDirection: 'row', alignItems: 'center' }}
          >
            <View style={s.spark}>
              <Sparkles size={19} color={colors.ink} />
            </View>
            <Text style={s.reunion}>
              {new Set(resource.data.buddies.map((b) => b.user_id)).size} possible reunions
            </Text>
          </Card>
          {!!mutation.error && <Copy error>{mutation.error}</Copy>}
          {resource.data.buddies.length === 0 && (
            <Card>
              <Users color={colors.tealDeep} size={28} />
              <Text style={s.name}>Your next reunion is ahead</Text>
              <Copy>
                Add your travel dates and share them with your groups to find people nearby.
              </Copy>
            </Card>
          )}
          {resource.data.buddies.map((buddy) => (
            <Card key={buddy.id}>
              <View style={s.row}>
                <View style={s.avatar}>
                  <Text style={s.name}>{initials(buddy.full_name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{buddy.full_name}</Text>
                  <Text style={s.location}>{buddy.city}</Text>
                </View>
              </View>
              <View style={s.dates}>
                <Text style={s.badgeText}>
                  {buddy.arrival} – {buddy.departure}
                </Text>
                <Copy>Your travel dates overlap.</Copy>
              </View>
              <Button
                title={pending.includes(buddy.user_id) ? 'Request sent' : 'Request to connect'}
                secondary={pending.includes(buddy.user_id)}
                disabled={mutation.busy || pending.includes(buddy.user_id)}
                onPress={() =>
                  void mutation.run(async () => {
                    await requestConnection(buddy.user_id);
                    setPending((current) => [...current, buddy.user_id]);
                  })
                }
              />
            </Card>
          ))}
        </>
      )}
    </Page>
  );
}
const s = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    borderRadius: 30,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.soft,
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 12, color: colors.tealDeep },
  spark: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: colors.sunset,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reunion: { fontFamily: fonts.serif, fontSize: 24, color: colors.ink, flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  location: { fontFamily: fonts.body, fontSize: 12, color: colors.tealDeep, marginTop: 2 },
  dates: { backgroundColor: colors.canvas, borderRadius: 16, padding: 16, gap: 4 },
});
