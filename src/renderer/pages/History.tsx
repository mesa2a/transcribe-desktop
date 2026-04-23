import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Segment, Session } from '@shared/types'

// 履歴画面: 過去のセッション一覧と、選択したセッションの文字起こし内容を表示

export default function History() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [selected, setSelected] = useState<Session | null>(null)
  const [segments, setSegments] = useState<Segment[]>([])

  async function refresh() {
    setSessions(await api.listSessions())
  }

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    if (selected) api.getSegments(selected.id).then(setSegments)
    else setSegments([])
  }, [selected])

  async function del(id: number) {
    if (!confirm('このセッションを削除しますか？')) return
    await api.deleteSession(id)
    if (selected?.id === id) setSelected(null)
    refresh()
  }

  async function rename(s: Session) {
    const next = prompt('新しいタイトル', s.title)
    if (next && next !== s.title) {
      await api.renameSession(s.id, next)
      refresh()
    }
  }

  return (
    <div className="flex h-full">
      <aside className="w-80 border-r border-neutral-800 overflow-auto">
        <div className="px-4 py-3 border-b border-neutral-800 text-sm text-neutral-400">
          セッション ({sessions.length})
        </div>
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelected(s)}
            className={`w-full text-left px-4 py-3 border-b border-neutral-900 hover:bg-neutral-900 ${
              selected?.id === s.id ? 'bg-neutral-900' : ''
            }`}
          >
            <div className="text-sm text-neutral-100 truncate">{s.title}</div>
            <div className="text-xs text-neutral-500 mt-0.5">
              {new Date(s.startedAt).toLocaleString()} · {formatDur(s.durationMs)}
            </div>
          </button>
        ))}
      </aside>

      <section className="flex-1 overflow-auto">
        {!selected && (
          <div className="h-full flex items-center justify-center text-neutral-600 text-sm">
            左のリストからセッションを選んでください
          </div>
        )}
        {selected && (
          <>
            <header className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <h1 className="text-lg font-medium">{selected.title}</h1>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {new Date(selected.startedAt).toLocaleString()} ·{' '}
                  {formatDur(selected.durationMs)} · {segments.length} セグメント
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => rename(selected)}
                  className="px-3 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 text-sm"
                >
                  名前変更
                </button>
                <button
                  onClick={() => del(selected.id)}
                  className="px-3 py-1.5 rounded-md bg-red-900 hover:bg-red-800 text-sm"
                >
                  削除
                </button>
              </div>
            </header>
            <div className="px-6 py-4 space-y-2">
              {segments.map((seg) => (
                <div key={seg.id} className="flex gap-3">
                  {seg.speakerId && (
                    <span className="text-xs text-neutral-500 mt-1 w-14 shrink-0">
                      {seg.speakerId}
                    </span>
                  )}
                  <div className="flex-1">
                    <span className="text-xs text-neutral-600 mr-2">
                      {formatMs(seg.startMs)}
                    </span>
                    <span>{seg.text}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function formatDur(ms: number): string {
  if (!ms) return '—'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}
