import { useCallback } from 'react';
import { useAuth } from '../providers/AuthProvider';
import { listNetworkTrips } from '../lib/data';
import { useResource } from '../lib/useResource';
import { Button, Card, Copy, Heading, Loading, Page } from '../components/ui';
import WorldMap from '../components/WorldMap';
export default function MapScreen() {
  const id = useAuth().session!.user.id;
  const resource = useResource(useCallback(() => listNetworkTrips(id), [id]));
  return (
    <Page
      title="Explore map"
      eyebrow="Your trusted network"
      subtitle="See where your people are now and where they are headed next."
    >
      {resource.loading && <Loading />}
      {!!resource.error && (
        <>
          <Copy error>{resource.error}</Copy>
          <Button title="Try again" secondary onPress={() => void resource.reload()} />
        </>
      )}
      <Card style={{ padding: 12 }}>
        <WorldMap
          people={new Set(resource.data?.map((t) => t.user_id)).size}
          cities={new Set(resource.data?.map((t) => t.city_id)).size}
        />
      </Card>
      <Card>
        <Heading>Nearby & upcoming</Heading>
        {resource.data?.length === 0 && <Copy>No shared travel plans yet.</Copy>}
        {resource.data?.map((trip) => (
          <Card key={trip.id}>
            <Heading>{trip.full_name}</Heading>
            <Copy>{trip.city}</Copy>
            <Copy>
              {trip.arrival} – {trip.departure}
            </Copy>
          </Card>
        ))}
      </Card>
    </Page>
  );
}
