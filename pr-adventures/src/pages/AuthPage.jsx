import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useI18n } from '../lib/i18n.jsx'

export default function AuthPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMessage({ kind: 'ok', text: t('checkEmail') })
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate('/')
      }
    } catch (err) {
      setMessage({ kind: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm p-6">
      <div className="mt-8 text-center">
        <div className="text-5xl">🏝️</div>
        <h1 className="mt-2 text-2xl font-bold text-teal-700">PR Adventures</h1>
        <p className="mt-2 text-sm text-slate-500">{t('signInPrompt')}</p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('email')}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3"
        />
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('password')}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-teal-600 py-3 font-semibold text-white disabled:opacity-50"
        >
          {mode === 'signup' ? t('signUp') : t('signIn')}
        </button>
      </form>

      {message && (
        <p
          className={`mt-3 text-center text-sm ${
            message.kind === 'error' ? 'text-red-600' : 'text-teal-700'
          }`}
        >
          {message.text}
        </p>
      )}

      <button
        type="button"
        onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
        className="mt-6 w-full text-center text-sm font-medium text-teal-600"
      >
        {mode === 'signup' ? t('haveAccount') : t('needAccount')}
      </button>
    </div>
  )
}
