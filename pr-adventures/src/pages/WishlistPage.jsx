import { Link } from 'react-router-dom'
import { usePlaces } from '../hooks/usePlaces.js'
import { useWishlist } from '../hooks/useWishlist.js'
import WishlistButton from '../components/WishlistButton.jsx'
import { CATEGORIES, categoryLabel } from '../lib/categories.js'
import { useI18n } from '../lib/i18n.jsx'

export default function WishlistPage() {
  const { places, loading } = usePlaces()
  const wishlist = useWishlist()
  const { t, lang } = useI18n()

  const saved = places.filter((p) => wishlist.ids.has(p.id))

  if (loading || wishlist.loading)
    return <div className="p-8 text-center text-slate-500">{t('loading')}</div>

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="text-2xl font-bold text-teal-800">❤️ {t('wishlist')}</h1>
      {saved.length === 0 ? (
        <p className="mt-8 text-center text-slate-500">{t('emptyWishlist')}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {saved.map((place) => {
            const cat = CATEGORIES[place.category] ?? CATEGORIES.landmark
            return (
              <li key={place.id}>
                <Link
                  to={`/place/${place.slug}`}
                  className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm"
                >
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl"
                    style={{ background: `${cat.color}22` }}
                  >
                    {cat.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{place.name}</span>
                    <span className="block text-sm text-slate-500">
                      {categoryLabel(place.category, lang)} · {place.municipality}
                    </span>
                  </span>
                  <WishlistButton placeId={place.id} wishlist={wishlist} />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
