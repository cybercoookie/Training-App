import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { CATEGORIES } from '../lib/categories.js'

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
// Puerto Rico main island plus Vieques and Culebra.
const PR_BOUNDS = [
  [-67.35, 17.85],
  [-65.16, 18.55],
]
const MAX_BOUNDS = [
  [-68.5, 17.2],
  [-64.2, 19.2],
]

export default function MapView({ places, selectedId, onSelect }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef(new Map())
  const onSelectRef = useRef(null)

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      bounds: PR_BOUNDS,
      fitBoundsOptions: { padding: 24 },
      maxBounds: MAX_BOUNDS,
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true,
      }),
      'top-right',
    )
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      markersRef.current = new Map()
    }
  }, [])

  // Sync markers with the (filtered) place list.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const markers = markersRef.current
    const wanted = new Set(places.map((p) => p.id))

    for (const [id, marker] of markers) {
      if (!wanted.has(id)) {
        marker.remove()
        markers.delete(id)
      }
    }

    for (const place of places) {
      if (markers.has(place.id)) continue
      const cat = CATEGORIES[place.category] ?? CATEGORIES.landmark
      const el = document.createElement('button')
      el.type = 'button'
      el.title = place.name
      el.textContent = cat.emoji
      el.style.cssText = `width:34px;height:34px;border-radius:9999px;border:2px solid white;background:${cat.color};display:flex;align-items:center;justify-content:center;font-size:16px;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.3);`
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        onSelectRef.current?.(place)
      })
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([place.lng, place.lat])
        .addTo(map)
      markers.set(place.id, marker)
    }
  }, [places])

  // Fly to the selected place.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedId) return
    const place = places.find((p) => p.id === selectedId)
    if (place) {
      map.flyTo({ center: [place.lng, place.lat], zoom: Math.max(map.getZoom(), 11.5) })
    }
  }, [selectedId, places])

  return <div ref={containerRef} className="h-full w-full" />
}
