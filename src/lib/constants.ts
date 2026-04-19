import L from 'leaflet';
import { Station } from '../types';

export const BRAND_COLORS = {
  checked: '#10b981', // Emerald 500
  planned: '#f59e0b', // Amber 500
  unchecked: '#f43f5e' // Rose 500
};

export const createSvgMarker = (color: string) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" width="36" height="36" style="filter: drop-shadow(0px 3px 5px rgba(0,0,0,0.4)); stroke: white; stroke-width: 0.75px;">
    <!-- Base tower triangle -->
    <path d="M9 22L11 8H13L15 22H9Z" />
    <!-- Cross bars -->
    <path d="M9.5 18H14.5M10 13H14M10.5 9H13.5" stroke="white" stroke-width="1.5" />
    <!-- Top bulb -->
    <circle cx="12" cy="5" r="2.5" />
    <!-- Signal waves left -->
    <path d="M6 7A5 5 0 0 1 6 3M3 9A8 8 0 0 1 3 1" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" />
    <!-- Signal waves right -->
    <path d="M18 7A5 5 0 0 0 18 3M21 9A8 8 0 0 0 21 1" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" />
  </svg>`;
  return new L.DivIcon({
    className: 'custom-svg-marker',
    html: svg,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36]
  });
};

export const svgIcons = {
  checked: createSvgMarker(BRAND_COLORS.checked),
  planned: createSvgMarker(BRAND_COLORS.planned),
  unchecked: createSvgMarker(BRAND_COLORS.unchecked)
};

export const formatStationName = (name: string) => {
  if (!name) return '';
  const parts = name.split(/[-_]/);
  if (parts.length >= 3) {
    return parts[1].trim();
  }
  if (parts.length === 2) {
    return parts[1].trim();
  }
  return name;
};

export const iconCache: Record<string, L.DivIcon> = {};

export const getStationIcon = (_station: Station, _isPlanned: boolean = false): any => {
  return undefined;
};
