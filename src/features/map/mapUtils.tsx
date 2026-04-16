import React, { useEffect } from 'react';
import { MapPin, Route, Settings, Home } from 'lucide-react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { Station } from '@/src/types';
import { cn } from '@/src/lib/utils';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const checkedIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const uncheckedIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const plannedIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const iconCache: Record<string, L.DivIcon> = {};

export const getStationIcon = (station: Station, isPlanned: boolean = false) => {
  if (station.icon) {
    const borderColor = station.status === 'checked' ? '#10B981' : (isPlanned ? '#F97316' : '#EF4444');
    const cacheKey = `${station.id}-${borderColor}-${station.icon}`;

    if (!iconCache[cacheKey]) {
      iconCache[cacheKey] = new L.DivIcon({
        className: 'custom-station-icon',
        html: `<div style="width: 32px; height: 32px; border-radius: 50%; overflow: hidden; border: 3px solid ${borderColor}; background-color: white; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"><img src="${station.icon}" style="width: 100%; height: 100%; object-fit: cover;" /></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
      });
    }
    return iconCache[cacheKey];
  }
  if (station.status === 'checked') return checkedIcon;
  if (isPlanned) return plannedIcon;
  return uncheckedIcon;
};

export const formatStationName = (name: string) => {
  if (!name) return '';
  const parts = name.split(/[-_]/);
  if (parts.length >= 3) return parts[1].trim();
  if (parts.length === 2) return parts[1].trim();
  return name;
};

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

export function NavButton({ active, onClick, icon, label }: any) {
  const isLong = label.length > 10;
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1.5 pt-2 pb-1 transition-all duration-300 w-16 overflow-hidden group',
        active ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
      )}
    >
      <div className={cn(
        'relative w-12 h-10 rounded-2xl transition-all duration-300 flex items-center justify-center',
        active ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30' : 'bg-transparent text-gray-500 group-hover:bg-gray-100'
      )}>
        {React.cloneElement(icon, {
          className: cn('w-5 h-5 flex-shrink-0 transition-all duration-300', active ? 'stroke-[2.5px]' : 'stroke-2')
        })}
      </div>
      <div className="nav-text-container">
        <span className={cn('text-[10px] nav-text-scroll transition-all duration-300', active ? 'font-bold' : 'font-medium', isLong ? 'is-long' : '')}>{label}</span>
      </div>
    </button>
  );
}

export const navIcons = { MapPin, Route, Settings, Home };
