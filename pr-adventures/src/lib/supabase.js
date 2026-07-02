import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.warn('Supabase env vars missing — copy .env.example to .env.local and fill them in.')
}

export const supabase = createClient(url, anonKey)

export const PHOTOS_BUCKET = 'journal-photos'

export async function signedPhotoUrl(path) {
  const { data, error } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrl(path, 60 * 60)
  if (error) return null
  return data.signedUrl
}
