import { useNavigate } from 'react-router-dom'
import { useI18n } from '../lib/i18n.jsx'

export default function WishlistButton({ placeId, wishlist, className = '' }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const saved = wishlist.ids.has(placeId)

  async function handleClick(e) {
    e.stopPropagation()
    if (!wishlist.signedIn) {
      navigate('/auth')
      return
    }
    await wishlist.toggle(placeId)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={saved ? t('removeFromWishlist') : t('addToWishlist')}
      className={`flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg shadow ${className}`}
    >
      {saved ? '❤️' : '🤍'}
    </button>
  )
}
