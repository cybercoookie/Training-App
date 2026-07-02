import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, signedPhotoUrl } from '../lib/supabase.js'
import { CATEGORIES } from '../lib/categories.js'
import { useI18n } from '../lib/i18n.jsx'

export default function JournalPage() {
  const { t, lang } = useI18n()
  const [entries, setEntries] = useState(null)
  const [thumbs, setThumbs] = useState({})

  useEffect(() => {
    supabase
      .from('journal_entries')
      .select('*, place:places(name, slug, category, municipality), journal_photos(id, storage_path)')
      .order('visited_on', { ascending: false })
      .then(({ data }) => setEntries(data ?? []))
  }, [])

  // Resolve a signed thumbnail URL for the first photo of each entry.
  useEffect(() => {
    if (!entries) return
    let cancelled = false
    async function load() {
      const urls = {}
      for (const entry of entries) {
        const photo = entry.journal_photos?.[0]
        if (photo) urls[entry.id] = await signedPhotoUrl(photo.storage_path)
      }
      if (!cancelled) setThumbs(urls)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [entries])

  if (!entries) return <div className="p-8 text-center text-slate-500">{t('loading')}</div>

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="text-2xl font-bold text-teal-800">📓 {t('journal')}</h1>
      {entries.length === 0 ? (
        <p className="mt-8 text-center text-slate-500">{t('emptyJournal')}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {entries.map((entry) => {
            const cat = CATEGORIES[entry.place?.category] ?? CATEGORIES.landmark
            return (
              <li key={entry.id}>
                <Link
                  to={`/journal/edit/${entry.id}`}
                  className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm"
                >
                  {thumbs[entry.id] ? (
                    <img
                      src={thumbs[entry.id]}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <span
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-2xl"
                      style={{ background: `${cat.color}22` }}
                    >
                      {cat.emoji}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{entry.place?.name}</span>
                    <span className="block text-sm text-slate-500">
                      {new Date(entry.visited_on + 'T12:00:00').toLocaleDateString(
                        lang === 'es' ? 'es-PR' : 'en-US',
                        { year: 'numeric', month: 'short', day: 'numeric' },
                      )}
                      {entry.rating ? ` · ${'⭐'.repeat(entry.rating)}` : ''}
                    </span>
                    {entry.notes && (
                      <span className="mt-0.5 block truncate text-sm text-slate-400">
                        {entry.notes}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
