import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import MapView from '../components/MapView.jsx'
import WishlistButton from '../components/WishlistButton.jsx'
import { usePlaces } from '../hooks/usePlaces.js'
import { useWishlist } from '../hooks/useWishlist.js'
import { CATEGORIES, categoryLabel } from '../lib/categories.js'
import { useI18n } from '../lib/i18n.jsx'
import { openDirections, getCurrentPosition } from '../lib/geo.js'

export default function MapPage() {
  const { places, loading } = usePlaces()
  const wishlist = useWishlist()
  const { t, lang, pick } = useI18n()
  const [filter, setFilter] = useState(null)
  const [selected, setSelected] = useState(null)

  const visible = useMemo(
    () => (filter ? places.filter((p) => p.category === filter) : places),
    [places, filter],
  )

  async function handleDirections(place) {
    let origin = null
    try {
      origin = await getCurrentPosition()
    } catch {
      // Fall back to destination-only directions if location is unavailable.
    }
    openDirections(place, origin)
  }

  return (
    <div className="relative h-full">
      <MapView places={visible} selectedId={selected?.id} onSelect={setSelected} />

      {/* Category filter chips */}
      <div className="absolute top-3 left-0 right-12 flex gap-2 overflow-x-auto px-3 pb-1">
        <button
          type="button"
          onClick={() => setFilter(null)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium shadow ${
            filter === null ? 'bg-teal-600 text-white' : 'bg-white text-slate-700'
          }`}
        >
          {t('all')}
        </button>
        {Object.entries(CATEGORIES).map(([key, cat]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(filter === key ? null : key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium shadow ${
              filter === key ? 'bg-teal-600 text-white' : 'bg-white text-slate-700'
            }`}
          >
            {cat.emoji} {categoryLabel(key, lang)}
          </button>
        ))}
      </div>

      {loading && (
        <div className="absolute inset-x-0 top-16 mx-auto w-fit rounded-full bg-white px-4 py-2 text-sm shadow">
          {t('loading')}
        </div>
      )}

      {/* Selected place bottom sheet */}
      {selected && (
        <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-white p-4 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold">{selected.name}</h2>
              <p className="text-sm text-slate-500">
                {CATEGORIES[selected.category]?.emoji} {categoryLabel(selected.category, lang)} ·{' '}
                {selected.municipality}
                {selected.difficulty ? ` · ${t(selected.difficulty)}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <WishlistButton placeId={selected.id} wishlist={wishlist} />
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500"
              >
                ✕
              </button>
            </div>
          </div>
          <p className="mt-2 line-clamp-2 text-sm text-slate-600">{pick(selected, 'description')}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => handleDirections(selected)}
              className="flex-1 rounded-xl bg-teal-600 py-2.5 text-center font-semibold text-white"
            >
              🧭 {t('directions')}
            </button>
            <Link
              to={`/place/${selected.slug}`}
              className="flex-1 rounded-xl bg-slate-100 py-2.5 text-center font-semibold text-slate-700"
            >
              {t('details')}
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
