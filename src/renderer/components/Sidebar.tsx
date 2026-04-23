import { NavLink } from 'react-router-dom'

const items = [
  { to: '/record', label: '録音', icon: '●' },
  { to: '/history', label: '履歴', icon: '▤' },
  { to: '/search', label: '検索', icon: '⌕' },
  { to: '/settings', label: '設定', icon: '⚙' }
]

export default function Sidebar() {
  return (
    <nav className="w-52 bg-neutral-900 border-r border-neutral-800 flex flex-col py-4 px-2 gap-1">
      <div className="px-3 py-2 text-sm text-neutral-500 font-medium">Transcribe</div>
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          className={({ isActive }) =>
            `px-3 py-2 rounded-md text-sm flex items-center gap-2 transition ${
              isActive
                ? 'bg-neutral-800 text-white'
                : 'text-neutral-400 hover:bg-neutral-800/50'
            }`
          }
        >
          <span className="w-4 text-center">{it.icon}</span>
          {it.label}
        </NavLink>
      ))}
    </nav>
  )
}
