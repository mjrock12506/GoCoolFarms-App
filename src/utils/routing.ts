// Haversine distance between two GPS points in km
function haversine(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R    = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Nearest-neighbor sort — works offline, no API needed
// Starts from driver location and always picks the closest next stop
export function sortStopsByDistance<T extends {
  lat: number | null
  lng: number | null
}>(
  startLat: number,
  startLng: number,
  stops: T[]
): T[] {
  if (stops.length <= 1) return stops

  const remaining = [...stops]
  const sorted: T[] = []
  let curLat = startLat
  let curLng = startLng

  while (remaining.length > 0) {
    let nearest = 0
    let minDist = Infinity

    remaining.forEach((stop, i) => {
      const dist = haversine(
        curLat, curLng,
        stop.lat ?? startLat,
        stop.lng ?? startLng
      )
      if (dist < minDist) { minDist = dist; nearest = i }
    })

    const picked = remaining.splice(nearest, 1)[0]
    sorted.push(picked)
    curLat = picked.lat ?? curLat
    curLng = picked.lng ?? curLng
  }

  return sorted
}
