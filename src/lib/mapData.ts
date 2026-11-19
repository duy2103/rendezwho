import type { FeatureCollection, Point } from 'geojson';

export type Coordinates = { latitude?: number | null; longitude?: number | null };
export type MapPoint = {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  kind: 'city' | 'place';
  count?: number;
};
export type WorldMapProps = {
  people?: number;
  cities?: number;
  points?: MapPoint[];
  center?: [number, number];
  onSelect?: (id: string) => void;
  onPick?: (coordinates: [number, number]) => void;
};
export const mapStyle =
  process.env.EXPO_PUBLIC_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty';
export function hasCoordinates(
  value: Coordinates,
): value is { longitude: number; latitude: number } {
  return (
    typeof value.longitude === 'number' &&
    typeof value.latitude === 'number' &&
    Number.isFinite(value.longitude) &&
    Number.isFinite(value.latitude) &&
    Math.abs(value.longitude) <= 180 &&
    Math.abs(value.latitude) <= 90
  );
}
export function pointsGeoJSON(points: MapPoint[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: points.filter(hasCoordinates).map((p) => ({
      type: 'Feature',
      id: p.id,
      geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
      properties: { id: p.id, name: p.name, kind: p.kind, count: p.count ?? 1 },
    })),
  };
}
export function cityPoints(
  trips: { city_id: string; city: string; user_id: string; location?: Coordinates | null }[],
): MapPoint[] {
  const groups = new Map<string, { point: MapPoint; users: Set<string> }>();
  for (const trip of trips) {
    if (!trip.location || !hasCoordinates(trip.location)) continue;
    const entry = groups.get(trip.city_id) ?? {
      point: { id: trip.city_id, name: trip.city, kind: 'city', ...trip.location },
      users: new Set<string>(),
    };
    entry.users.add(trip.user_id);
    groups.set(trip.city_id, entry);
  }
  return [...groups.values()].map(({ point, users }) => ({ ...point, count: users.size }));
}

export function pointBounds(points: MapPoint[]): [number, number, number, number] | null {
  const valid = points.filter(hasCoordinates);
  if (valid.length < 2) return null;
  const xs = valid.map((p) => p.longitude);
  const ys = valid.map((p) => p.latitude);
  const west = Math.min(...xs),
    south = Math.min(...ys),
    east = Math.max(...xs),
    north = Math.max(...ys);
  return west === east && south === north ? null : [west, south, east, north];
}
