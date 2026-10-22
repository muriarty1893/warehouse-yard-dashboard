/**
 * City centres (lat, lon) for the yard and the demo destinations, used for
 * display-only stop ETAs on a route.
 */
export const CITIES: Record<string, [lat: number, lon: number]> = {
  Yard: [40.85, 29.3],
  Ankara: [39.93, 32.86],
  İzmir: [38.42, 27.14],
  Bursa: [40.19, 29.06],
  Konya: [37.87, 32.48],
  Adana: [37.0, 35.32],
  Antalya: [36.9, 30.7],
  Kayseri: [38.73, 35.49],
  Samsun: [41.29, 36.33],
  Eskişehir: [39.78, 30.52],
  Gaziantep: [37.07, 37.38],
  Mersin: [36.81, 34.64],
  Trabzon: [41.0, 39.72],
};

const ROAD_FACTOR = 1.25;
const KMH = 70;
const DROP_SECONDS = 30 * 60;

/** Great-circle distance in km. */
function km([lat1, lon1]: [number, number], [lat2, lon2]: [number, number]) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/** Arrival time (yard seconds of the day) at each stop for a truck leaving the yard at `departYardSeconds`. */
export function stopEtas(departYardSeconds: number, route: string[]): number[] {
  let t = departYardSeconds;
  let from = CITIES.Yard;
  return route.map((city) => {
    const to = CITIES[city];
    if (to) {
      t += ((km(from, to) * ROAD_FACTOR) / KMH) * 3600;
      from = to;
    }
    const arrival = t;
    t += DROP_SECONDS;
    return arrival;
  });
}
