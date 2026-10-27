"use client";
import { useSyncExternalStore } from "react";

const noop = () => () => {};
/** False during SSR and the hydration pass, true afterwards — gate reads of browser-only storage. */
export const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

/** Read a browser-storage value as a stable string snapshot (empty on the server). */
export const useStorageValue = (read: () => string, subscribe: (cb: () => void) => () => void = noop) =>
  useSyncExternalStore(subscribe, () => { try { return read(); } catch { return ""; } }, () => "");

export type Fix = { lat: number; lng: number; accuracy: number | null; at: string };

/** One fresh fix from the device at submission time (no background tracking). */
export function locate(): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This browser cannot provide a location."));
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? null, at: new Date(p.timestamp).toISOString() }),
      e => reject(new Error(e.code === 1 ? "Location permission was denied. Allow location for this site in your browser settings, then try again."
        : e.code === 3 ? "Finding your location took too long. Move to an open area and try again."
        : "Your location is unavailable. Check that location services are switched on, then try again.")),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
    );
  });
}

/** Best effort: the fix, or why there is none. Never blocks a submission. */
export const tryLocate = () => locate().then(gps => ({ gps, gps_reason: undefined }), (e: Error) => ({ gps: null, gps_reason: e.message }));
