import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useWishlist } from '../hooks/useWishlist.js'
import WishlistButton from '../components/WishlistButton.jsx'
import { CATEGORIES, categoryLabel } from '../lib/categories.js'
import { useI18n } from '../lib/i18n.jsx'
import { openDirections, getCurrentPosition, distanceKm } from '../lib/geo.js'

export default function PlaceDetailPage() {
  const { slug } = useParams()
  const { t, lang, pick } = useI18n()
  const wishlist = useWishlist()
  const [place, setPlace] = useState(null)
  const [distance, setDistance] = useState(null)

  useEffect(() => {
    supabase
      .from('places')
      .select('*')
      .eq('slug', slug)
      .single()
      .then(({ data }) => setPlace(data))
  }, [slug])

  useEffect(() => {
    if (!place) return
    getCurrentPosition()
      .then((pos) => setDistance(distanceKm(pos.lat, pos.lng, place.lat, place.lng)))
      .catch(() => {})
  }, [place])

  if (!place) return <div className="p-8 text-center text-slate-500">{t('loading')}</div>

  const cat = CATEGORIES[place.category] ?? CATEGORIES.landmark

  return (
    <div className="mx-auto max-w-2xl p-4">
      <Link to="/" className="text-sm font-medium text-teal-600">
        ← {t('backToMap')}
      </Link>

      <div
        className="mt-3 flex h-40 items-center justify-center rounded-2xl text-6xl"
        style={{ background: `${cat.color}22` }}
      >
        {cat.emoji}
      </div>

      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{place.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {cat.emoji} {categoryLabel(place.category, lang)} · {place.municipality}
            {distance != null && ` · ${distance.toFixed(1)} ${t('kmAway')}`}
          </p>
        </div>
        <WishlistButton placeId={place.id} wishlist={wishlist} />
      </div>

      {place.difficulty && (
        <p className="mt-2 text-sm">
          <span className="font-semibold">{t('difficulty')}:</span> {t(place.difficulty)}
        </p>
      )}

      <p className="mt-3 leading-relaxed text-slate-700">{pick(place, 'description')}</p>

      {place.tags?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {place.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-teal-100 px-3 py-1 text-xs text-teal-800">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={async () => {
            let origin = null
            try {
              origin = await getCurrentPosition()
            } catch {
              // destination-only directions
            }
            openDirections(place, origin)
          }}
          className="flex-1 rounded-xl bg-teal-600 py-3 text-center font-semibold text-white"
        >
          🧭 {t('directions')}
        </button>
        <Link
          to={`/journal/new/${place.id}`}
          className="flex-1 rounded-xl bg-orange-500 py-3 text-center font-semibold text-white"
        >
          📓 {t('logVisit')}
        </Link>
      </div>
    </div>
  )
}
