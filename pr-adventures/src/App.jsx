import { Routes, Route, Navigate } from 'react-router-dom'
import NavBar from './components/NavBar.jsx'
import MapPage from './pages/MapPage.jsx'
import PlaceDetailPage from './pages/PlaceDetailPage.jsx'
import WishlistPage from './pages/WishlistPage.jsx'
import JournalPage from './pages/JournalPage.jsx'
import JournalEntryPage from './pages/JournalEntryPage.jsx'
import AuthPage from './pages/AuthPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import { useAuth } from './lib/AuthContext.jsx'
import { useI18n } from './lib/i18n.jsx'

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const { t } = useI18n()
  if (loading) return <div className="p-8 text-center text-slate-500">{t('loading')}</div>
  if (!user) return <Navigate to="/auth" replace />
  return children
}

export default function App() {
  return (
    <div className="flex h-full flex-col">
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/place/:slug" element={<PlaceDetailPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route
            path="/wishlist"
            element={
              <RequireAuth>
                <WishlistPage />
              </RequireAuth>
            }
          />
          <Route
            path="/journal"
            element={
              <RequireAuth>
                <JournalPage />
              </RequireAuth>
            }
          />
          <Route
            path="/journal/new/:placeId"
            element={
              <RequireAuth>
                <JournalEntryPage />
              </RequireAuth>
            }
          />
          <Route
            path="/journal/edit/:entryId"
            element={
              <RequireAuth>
                <JournalEntryPage />
              </RequireAuth>
            }
          />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <NavBar />
    </div>
  )
}
