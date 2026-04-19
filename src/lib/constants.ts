import L from 'leaflet';
import { Station } from '../types';

export const BRAND_COLORS = {
  checked: '#10b981',   // xanh
  planned: '#f59e0b',   // vàng
  unchecked: '#f43f5e', // đỏ
};

const createPinSvg = (color: string) => `
<svg xmlns="http://www.w3.org/2000/svg" width="25" height="41" viewBox="0 0 25 41">
  <path
    d="M12.5 0C5.6 0 0 5.6 0 12.5c0 9.3 12.5 28.5 12.5 28.5S25 21.8 25 12.5C25 5.6 19.4 0 12.5 0z"
    fill="${color}"
    stroke="#ffffff"
    stroke-width="1.5"
  />
  <circle
    cx="12.5"
    cy="12.5"
    r="4.5"
    fill="#ffffff"
  />
</svg>
`;

const svgToDataUrl = (svg: string) =>
  `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

const createPinIcon = (color: string) =>
  new L.Icon({
    iconUrl: svgToDataUrl(createPinSvg(color)),
    shadowUrl:
      'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

export const svgIcons = {
  checked: createPinIcon(BRAND_COLORS.checked),
  planned: createPinIcon(BRAND_COLORS.planned),
  unchecked: createPinIcon(BRAND_COLORS.unchecked),
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

export const iconCache: Record<string, L.Icon> = {};

export const getStationIcon = (station: Station, isPlanned: boolean = false) => {
  if (station.status === 'checked') return svgIcons.checked;
  if (isPlanned) return svgIcons.planned;
  return svgIcons.unchecked;
};
