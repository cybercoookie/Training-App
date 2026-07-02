import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/AuthContext.jsx'

const EMPTY = new Set()

// Wishlist as a set of place ids with toggle support. State is keyed by user
// id so signing out (or switching users) falls back to an empty set without
// needing a synchronous reset.
export function useWishlist() {
  const { user } = useAuth()
  const [loaded, setLoaded] = useState({ userId: null, ids: EMPTY })

  useEffect(() => {
    if (!user) return
    let cancelled = false
    supabase
      .from('wishlist')
      .select('place_id')
      .then(({ data }) => {
        if (!cancelled) {
          setLoaded({ userId: user.id, ids: new Set((data ?? []).map((r) => r.place_id)) })
        }
      })
    return () => {
      cancelled = true
    }
  }, [user])

  const ready = !!user && loaded.userId === user.id
  const ids = ready ? loaded.ids : EMPTY

  const toggle = useCallback(
    async (placeId) => {
      if (!user) return false
      const has = ids.has(placeId)
      setLoaded((prev) => {
        const next = new Set(prev.ids)
        if (has) next.delete(placeId)
        else next.add(placeId)
        return { ...prev, ids: next }
      })
      if (has) {
        await supabase.from('wishlist').delete().eq('place_id', placeId)
      } else {
        await supabase.from('wishlist').insert({ user_id: user.id, place_id: placeId })
      }
      return true
    },
    [user, ids],
  )

  return { ids, toggle, loading: !!user && !ready, signedIn: !!user }
}
