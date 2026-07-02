import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase, signedPhotoUrl, PHOTOS_BUCKET } from '../lib/supabase.js'
import { useAuth } from '../lib/AuthContext.jsx'
import { useI18n } from '../lib/i18n.jsx'

export default function JournalEntryPage() {
  const { placeId, entryId } = useParams()
  const isEdit = !!entryId
  const { user } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()

  const [place, setPlace] = useState(null)
  const [visitedOn, setVisitedOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [rating, setRating] = useState(0)
  const [photos, setPhotos] = useState([]) // { id, storage_path, url }
  const [newFiles, setNewFiles] = useState([]) // File objects pending upload
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      if (isEdit) {
        const { data: entry } = await supabase
          .from('journal_entries')
          .select('*, place:places(id, name), journal_photos(id, storage_path)')
          .eq('id', entryId)
          .single()
        if (!entry) return
        setPlace(entry.place)
        setVisitedOn(entry.visited_on)
        setNotes(entry.notes ?? '')
        setRating(entry.rating ?? 0)
        const withUrls = await Promise.all(
          (entry.journal_photos ?? []).map(async (p) => ({
            ...p,
            url: await signedPhotoUrl(p.storage_path),
          })),
        )
        setPhotos(withUrls)
      } else {
        const { data } = await supabase
          .from('places')
          .select('id, name')
          .eq('id', placeId)
          .single()
        setPlace(data)
      }
    }
    load()
  }, [isEdit, entryId, placeId])

  async function handleSave(e) {
    e.preventDefault()
    if (!place) return
    setBusy(true)
    setError(null)
    try {
      let id = entryId
      const fields = {
        visited_on: visitedOn,
        notes: notes || null,
        rating: rating || null,
      }
      if (isEdit) {
        const { error } = await supabase.from('journal_entries').update(fields).eq('id', id)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('journal_entries')
          .insert({ ...fields, user_id: user.id, place_id: place.id })
          .select('id')
          .single()
        if (error) throw error
        id = data.id
      }

      for (const file of newFiles) {
        const ext = file.name.split('.').pop() || 'jpg'
        const path = `${user.id}/${id}/${crypto.randomUUID()}.${ext}`
        const { error: upErr } = await supabase.storage.from(PHOTOS_BUCKET).upload(path, file)
        if (upErr) throw upErr
        const { error: dbErr } = await supabase
          .from('journal_photos')
          .insert({ entry_id: id, user_id: user.id, storage_path: path })
        if (dbErr) throw dbErr
      }

      navigate('/journal')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm(t('confirmDelete'))) return
    setBusy(true)
    const paths = photos.map((p) => p.storage_path)
    if (paths.length) await supabase.storage.from(PHOTOS_BUCKET).remove(paths)
    await supabase.from('journal_entries').delete().eq('id', entryId)
    navigate('/journal')
  }

  async function removePhoto(photo) {
    await supabase.storage.from(PHOTOS_BUCKET).remove([photo.storage_path])
    await supabase.from('journal_photos').delete().eq('id', photo.id)
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
  }

  if (!place) return <div className="p-8 text-center text-slate-500">{t('loading')}</div>

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="text-2xl font-bold text-teal-800">
        📓 {t('logVisit')}: {place.name}
      </h1>

      <form onSubmit={handleSave} className="mt-4 space-y-4">
        <label className="block">
          <span className="text-sm font-semibold text-slate-600">{t('visitedOn')}</span>
          <input
            type="date"
            required
            value={visitedOn}
            onChange={(e) => setVisitedOn(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3"
          />
        </label>

        <div>
          <span className="text-sm font-semibold text-slate-600">{t('rating')}</span>
          <div className="mt-1 flex gap-1 text-2xl">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n === rating ? 0 : n)}
                aria-label={`${n} stars`}
                className={n <= rating ? '' : 'opacity-30 grayscale'}
              >
                ⭐
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="text-sm font-semibold text-slate-600">{t('notes')}</span>
          <textarea
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('notesPlaceholder')}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3"
          />
        </label>

        <div>
          <span className="text-sm font-semibold text-slate-600">{t('photos')}</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {photos.map((photo) => (
              <div key={photo.id} className="relative">
                <img src={photo.url} alt="" className="h-20 w-20 rounded-xl object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(photo)}
                  aria-label={t('delete')}
                  className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs text-white"
                >
                  ✕
                </button>
              </div>
            ))}
            {newFiles.map((file, i) => (
              <div key={i} className="relative">
                <img
                  src={URL.createObjectURL(file)}
                  alt=""
                  className="h-20 w-20 rounded-xl object-cover opacity-70"
                />
                <button
                  type="button"
                  onClick={() => setNewFiles((prev) => prev.filter((_, j) => j !== i))}
                  aria-label={t('delete')}
                  className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs text-white"
                >
                  ✕
                </button>
              </div>
            ))}
            <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-teal-300 text-2xl text-teal-500">
              +
              <input
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                className="hidden"
                onChange={(e) => setNewFiles((prev) => [...prev, ...Array.from(e.target.files)])}
              />
            </label>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="flex-1 rounded-xl bg-teal-600 py-3 font-semibold text-white disabled:opacity-50"
          >
            {busy ? t('saving') : t('save')}
          </button>
          {isEdit && (
            <button
              type="button"
              disabled={busy}
              onClick={handleDelete}
              className="rounded-xl bg-red-50 px-4 py-3 font-semibold text-red-600"
            >
              {t('delete')}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
