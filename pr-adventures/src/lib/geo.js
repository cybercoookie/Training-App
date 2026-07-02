// Distance in km between two [lat, lng] points (haversine).
export function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Opens turn-by-turn navigation from the user's current position to the place.
// Uses Google Maps universal URLs, which open the native app on Android/iOS
// (or Apple Maps via fallback) and the website on desktop.
export function openDirections(place, origin) {
  const dest = `${place.lat},${place.lng}`
  const params = new URLSearchParams({ api: '1', destination: dest })
  if (origin) params.set('origin', `${origin.lat},${origin.lng}`)
  window.open(`https://www.google.com/maps/dir/?${params.toString()}`, '_blank', 'noopener')
}

export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation unsupported'))
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  })
}
