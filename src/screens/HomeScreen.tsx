import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { CalendarDays, Globe2, Map, MapPin, Sparkles, Users } from 'lucide-react-native';
import { useAuth } from '../providers/AuthProvider';
import { getProfile, listCommunities, listNetworkTrips, listTrips } from '../lib/data';
import { useResource } from '../lib/useResource';
import { localDate } from '../lib/travel';
import { Button, Card, Copy, Eyebrow, Heading, Loading, Page } from '../components/ui';
import WorldMap from '../components/WorldMap';
import { colors, fonts } from '../theme/tokens';
export default function Home() {
  const id = useAuth().session!.user.id;
  const resource = useResource(
    useCallback(async () => {
      const [profile, trips, communities, network] = await Promise.all([
        getProfile(id),
        listTrips(id),
        listCommunities(id),
        listNetworkTrips(id),
      ]);
      return { profile, trips, communities, network };
    }, [id]),
  );
  const data = resource.data;
  const today = localDate();
  const next = data?.trips
    .filter((t) => t.departure >= today)
    .sort((a, b) => a.arrival.localeCompare(b.arrival))[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = data?.profile?.full_name?.trim().split(/\s+/)[0];
  return (
    <Page title={firstName ? `${greeting}, ${firstName}.` : `${greeting}.`}>
      {resource.loading && <Loading />}
      {!!resource.error && (
        <>
          <Copy error>{resource.error}</Copy>
          <Button title="Retry" onPress={() => void resource.reload()} />
        </>
      )}
      {data && (
        <>
          {!data.profile && (
            <Card>
              <Copy>Welcome! Complete your profile before adding your travel plans.</Copy>
              <Button title="Set up profile" onPress={() => router.push('/profile')} />
            </Card>
          )}
          <View style={{ alignSelf: 'flex-start' }}>
            <Button
              title="All groups"
              secondary
              icon={<Users size={16} color={colors.tealDeep} />}
              onPress={() => router.push('/communities')}
            />
          </View>
          <Card style={{ padding: 12 }}>
            <View style={s.row}>
              <View style={s.spark}>
                <Sparkles size={19} color={colors.ink} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  style={{ fontFamily: fonts.serifSemibold, fontSize: 24, color: colors.ink }}
                >
                  Who’s where
                </Text>
              </View>
              <Button
                title="Open map"
                compact
                secondary
                icon={<Map size={16} color={colors.tealDeep} />}
                onPress={() => router.push('/map')}
              />
            </View>
            <WorldMap
              people={new Set(data.network.map((t) => t.user_id)).size}
              cities={new Set(data.network.map((t) => t.city_id)).size}
            />
          </Card>
          <View style={{ gap: 16 }}>
            <View>
              <Eyebrow>From your circles</Eyebrow>
              <Heading>Recent activity</Heading>
            </View>
            {data.network.length === 0 ? (
              <Card>
                <Copy>Travel plans shared by your circles will appear here.</Copy>
                <Button
                  title="Find your groups"
                  secondary
                  onPress={() => router.push('/communities')}
                />
              </Card>
            ) : (
              data.network.slice(0, 4).map((trip) => (
                <Card key={trip.id}>
                  <Text style={s.bold}>
                    {trip.full_name} is heading to {trip.city}
                  </Text>
                  <Copy>
                    {trip.arrival} – {trip.departure}
                  </Copy>
                  {!!trip.note && <Copy>{trip.note}</Copy>}
                  <View style={s.tag}>
                    <MapPin size={12} color={colors.tealDeep} />
                    <Text style={s.tagText}>Travel plans</Text>
                  </View>
                </Card>
              ))
            )}
          </View>
          <Card style={{ backgroundColor: colors.goldSoft, padding: 24 }}>
            <View style={s.between}>
              <Eyebrow>Your travels</Eyebrow>
              <Globe2 size={20} color={colors.tealDeep} />
            </View>
            <View style={[s.row, { marginTop: 12, alignItems: 'baseline' }]}>
              <Text style={s.total}>
                {new Set(data.trips.filter((t) => t.arrival <= today).map((t) => t.city_id)).size}
              </Text>
              <Copy>cities</Copy>
            </View>
            <Copy>{data.trips.length} recorded trips</Copy>
            <Button title="View travel journal →" secondary onPress={() => router.push('/trips')} />
          </Card>
          <Card>
            <View style={s.between}>
              <View>
                <Eyebrow>Coming up</Eyebrow>
                <Heading>Your next trip</Heading>
              </View>
              <CalendarDays size={20} color={colors.tealDeep} />
            </View>
            <View style={s.next}>
              <View style={s.row}>
                <MapPin size={14} color={colors.tealDeep} />
                <Text style={s.tagText}>{next?.city ?? 'Your next adventure'}</Text>
              </View>
              <Heading>
                {next ? (next.arrival <= today ? 'Here now' : 'Coming soon') : 'Where to next?'}
              </Heading>
              {next && (
                <Copy>
                  {next.arrival} – {next.departure}
                </Copy>
              )}
            </View>
            <Button
              title={next ? 'View trip' : 'Add check-in'}
              secondary
              onPress={() =>
                router.push(
                  next ? '/trips' : { pathname: '/trips', params: { add: String(Date.now()) } },
                )
              }
            />
          </Card>
          <Card>
            <Heading>Your groups</Heading>
            {data.communities.length === 0 && <Copy>Your trusted circles start here.</Copy>}
            {data.communities.slice(0, 4).map((group) => (
              <Button
                key={group.id}
                title={group.name}
                secondary
                icon={<Users size={16} color={colors.tealDeep} />}
                onPress={() => router.push('/communities')}
              />
            ))}
            <Button title="Manage groups" secondary onPress={() => router.push('/communities')} />
          </Card>
        </>
      )}
    </Page>
  );
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  spark: {
    width: 40,
    height: 44,
    borderRadius: 16,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-6deg' }],
  },
  bold: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  tag: {
    flexDirection: 'row',
    gap: 6,
    alignSelf: 'flex-start',
    alignItems: 'center',
    borderRadius: 30,
    backgroundColor: colors.soft,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: { fontFamily: fonts.bold, fontSize: 11, color: colors.tealDeep },
  total: { fontFamily: fonts.serif, fontSize: 60, color: colors.ink },
  next: { backgroundColor: colors.soft, padding: 16, gap: 8, borderRadius: 16 },
});
