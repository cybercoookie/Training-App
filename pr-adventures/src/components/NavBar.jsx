import { NavLink } from 'react-router-dom'
import { useI18n } from '../lib/i18n.jsx'

const TABS = [
  { to: '/', key: 'map', icon: '🗺️', end: true },
  { to: '/wishlist', key: 'wishlist', icon: '❤️' },
  { to: '/journal', key: 'journal', icon: '📓' },
  { to: '/profile', key: 'profile', icon: '👤' },
]

export default function NavBar() {
  const { t } = useI18n()
  return (
    <nav className="flex shrink-0 border-t border-teal-100 bg-white">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium ${
              isActive ? 'text-teal-600' : 'text-slate-400'
            }`
          }
        >
          <span className="text-lg leading-none">{tab.icon}</span>
          {t(tab.key)}
        </NavLink>
      ))}
    </nav>
  )
}
