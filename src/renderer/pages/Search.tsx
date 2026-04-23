import { useState } from 'react'
import { api } from '../lib/api'
import type { Segment } from '@shared/types'

type Result = Segment & { sessionTitle: string }

// 全セッション横断の全文検索画面（FTS5）

export default function Search() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)

  async function run() {
    if (!q.trim()) return
    setLoading(true)
    try {
      // FTS5 のクエリは前方一致ワイルドカードや AND を直接書ける
      const r = (await api.searchTranscripts(q.trim())) as Result[]
      setResults(r)
    } catch (e) {
      alert(`検索エラー: ${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-4 border-b border-neutral-800">
        <h1 className="text-lg font-medium mb-3">検索</h1>
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            placeholder="キーワード（スペース区切りで AND 検索）"
            className="flex-1 bg-neutral-900 border border-neutral-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-neutral-600"
          />
          <button
            onClick={run}
            disabled={loading}
            className="px-4 py-2 rounded-md bg-neutral-700 hover:bg-neutral-600 text-sm disabled:opacity-50"
          >
            {loading ? '検索中...' : '検索'}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto px-6 py-4 space-y-3">
        {results.length === 0 && !loading && (
          <p className="text-neutral-600 text-sm">
            {q ? '結果がありません' : 'キーワードを入力してください'}
          </p>
        )}
        {results.map((r) => (
          <div key={r.id} className="p-3 rounded-md bg-neutral-900 border border-neutral-800">
            <div className="text-xs text-neutral-500 mb-1">
              {r.sessionTitle} · {formatMs(r.startMs)}
              {r.speakerId && ` · ${r.speakerId}`}
            </div>
            <div className="text-sm">{highlight(r.text, q)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function highlight(text: string, q: string) {
  if (!q) return text
  const terms = q.split(/\s+/).filter(Boolean)
  if (terms.length === 0) return text
  const re = new RegExp(`(${terms.map(escapeRe).join('|')})`, 'gi')
  const parts = text.split(re)
  return parts.map((p, i) =>
    re.test(p) ? (
      <mark key={i} className="bg-yellow-700/40 text-yellow-100 rounded px-0.5">
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    )
  )
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
