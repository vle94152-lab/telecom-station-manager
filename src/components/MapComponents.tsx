import React, { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

export function MapUpdater({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  const positionsStr = JSON.stringify(positions);
  
  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [positionsStr, map]);
  return null;
}
