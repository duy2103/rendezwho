import * as Location from 'expo-location';
import { searchLocations } from './data';

/** A one-shot lookup: only a ~11 km grid point leaves the device. */
export async function findCurrentCities() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error('Location permission was not granted. Search for your city instead.');
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Location took too long. Try again or search for your city.')),
          15000,
        );
      }),
    ]);
    const response = await searchLocations('city', '', undefined, {
      latitude: Math.round(position.coords.latitude * 10) / 10,
      longitude: Math.round(position.coords.longitude * 10) / 10,
    });
    if (!response.results.length)
      throw new Error('No nearby city found. Search for your city instead.');
    return response;
  } finally {
    clearTimeout(timer);
  }
}
