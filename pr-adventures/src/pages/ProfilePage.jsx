import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/AuthContext.jsx'
import { useI18n } from '../lib/i18n.jsx'

export default function ProfilePage() {
  const { user } = useAuth()
  const { t, lang, setLang } = useI18n()
  const navigate = useNavigate()

  return (
    <div className="mx-auto max-w-sm p-6">
      <h1 className="text-2xl font-bold text-teal-800">👤 {t('profile')}</h1>

      <div className="mt-6 rounded-2xl bg-white p-4 shadow-sm">
        <span className="text-sm font-semibold text-slate-600">{t('language')}</span>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setLang('es')}
            className={`flex-1 rounded-xl py-2.5 font-semibold ${
              lang === 'es' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            Español
          </button>
          <button
            type="button"
            onClick={() => setLang('en')}
            className={`flex-1 rounded-xl py-2.5 font-semibold ${
              lang === 'en' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            English
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        {user ? (
          <>
            <p className="truncate text-sm text-slate-500">{user.email}</p>
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut()
                navigate('/')
              }}
              className="mt-3 w-full rounded-xl bg-slate-100 py-2.5 font-semibold text-slate-700"
            >
              {t('signOut')}
            </button>
          </>
        ) : (
          <Link
            to="/auth"
            className="block w-full rounded-xl bg-teal-600 py-2.5 text-center font-semibold text-white"
          >
            {t('signIn')}
          </Link>
        )}
      </div>
    </div>
  )
}
