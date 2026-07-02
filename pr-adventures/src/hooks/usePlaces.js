import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

export function usePlaces() {
  const [places, setPlaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('places')
      .select('*')
      .order('name')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError(error)
        else setPlaces(data ?? [])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { places, loading, error }
}
