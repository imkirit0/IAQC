"use client";
import { useSyncExternalStore } from "react";

const noop = () => () => {};
/** False during SSR and the hydration pass, true afterwards — gate reads of browser-only storage. */
export const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

/** Read a browser-storage value as a stable string snapshot (empty on the server). */
export const useStorageValue = (read: () => string, subscribe: (cb: () => void) => () => void = noop) =>
  useSyncExternalStore(subscribe, () => { try { return read(); } catch { return ""; } }, () => "");

/** age: ms since the fix, on the device's own clock (the server dates it by its own clock, so a wrong device clock or time zone cannot fail it). */
export type Fix = { lat: number; lng: number; accuracy: number | null; age: number };

const ENABLE = "On Windows, open Settings > Privacy & security > Location and turn on Location services and \"Let desktop apps access your location\". On a phone, switch Location on.";

/** One fresh fix from the device at submission time (no background tracking, never a cached position). */
export function locate(): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This browser cannot provide a location."));
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? null, age: Math.max(0, Date.now() - p.timestamp) || 0 }),
      e => reject(new Error(e.code === 1 ? `Location permission was denied. Click the icon at the left of the address bar, allow Location for this site, then try again. ${ENABLE}`
        : e.code === 3 ? "Finding your location took too long. Check that Wi-Fi is on (laptops locate through it) or move to an open area, then try again."
        : `Your location is unavailable. ${ENABLE}`)),
      // Laptops and desktops have no GPS and locate through Wi-Fi, which can be slow: allow 20 s.
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}

/** Best effort: the fix, or why there is none. Never blocks a submission. */
export const tryLocate = () => locate().then(gps => ({ gps, gps_reason: undefined }), (e: Error) => ({ gps: null, gps_reason: e.message }));
