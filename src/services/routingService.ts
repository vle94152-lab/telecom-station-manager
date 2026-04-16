export async function fetchRouteGeometry(coordinates: string): Promise<[number, number][]> {
  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?geometries=geojson&overview=full`);
  const data = await res.json();
  if (data.routes && data.routes[0]) {
    return data.routes[0].geometry.coordinates.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
  }
  return [];
}
