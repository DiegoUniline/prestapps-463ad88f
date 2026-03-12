import { useEffect, useRef, useState } from "react";

interface GeoPos {
  lat: number | null;
  lng: number | null;
}

/**
 * Silently requests the user's GPS position.
 * Returns { lat, lng } once available, or nulls if denied/unavailable.
 */
export function useGeoLocation(): GeoPos {
  const [pos, setPos] = useState<GeoPos>({ lat: null, lng: null });
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;

    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {}, // silent fail
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  return pos;
}
