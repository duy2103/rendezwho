import type { NetworkTrip, Trip } from './data';
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function overlappingTrips(own: Trip[], network: NetworkTrip[]) {
  return network.filter((other) =>
    own.some(
      (trip) =>
        trip.city_id === other.city_id &&
        trip.arrival <= other.departure &&
        trip.departure >= other.arrival,
    ),
  );
}
export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}
