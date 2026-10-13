import * as Location from "expo-location";
import type { GeoPoint } from "../api/attendance";

export class LocationError extends Error {}

/*
 * One fresh position for check-in / check-out. The server checks it against
 * the office geofence, so a denied permission is an error the person must
 * fix, not something to paper over by sending nothing.
 */
export const currentPosition = async (): Promise<GeoPoint> => {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") {
    throw new LocationError("Location permission is needed to confirm you're at the office. Allow it in your phone's settings and try again.");
  }
  try {
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 20000)),
    ]);
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy ?? null,
    };
  } catch {
    throw new LocationError("Couldn't get your location. Turn on location services, step near a window, and try again.");
  }
};
