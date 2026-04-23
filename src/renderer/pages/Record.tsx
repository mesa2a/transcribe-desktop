import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { AudioCapture } from '../lib/audio'
import type { FinalResult, PartialResult } from '@shared/types'

// 録音 & リアルタイム文字起こし画面

export default function Record() {
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [finals, setFinals] = useState<FinalResult[]>([])
  const [partial, setPartial] = useState<PartialResult | null>(null)
  const [level, setLevel] = useState(0)
  const [starting, setStarting] = useState(false)
  const captureRef = useRef<AudioCapture | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // 結果購読
  useEffect(() => {
    const offP = api.onPartial((r) => setPartial(r))
    const offF = api.onFinal((r) => {
      setFinals((prev) => [...prev, r])
      setPartial(null)
    })
    return () => {
      offP()
      offF()
    }
  }, [])

  // 自動スクロール
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [finals, partial])

  async function start() {
    setStarting(true)
    try {
      const settings = await api.getSettings()
      const id = await api.startSession()
      setSessionId(id)
      const cap = new AudioCapture(id, setLevel)
      await cap.start(settings.inputDeviceId)
      captureRef.current = cap
    } catch (e) {
      alert(`開始に失敗しました: ${(e as Error).message}`)
    } finally {
      setStarting(false)
    }
  }

  async function stop() {
    if (!sessionId) return
    await captureRef.current?.stop()
    captureRef.current = null
    await api.stopSession(sessionId)
    setSessionId(null)
    setPartial(null)
    setLevel(0)
  }

  const isRecording = sessionId !== null

  return (
    <div className="flex flex-col h-full">
      <header className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium">録音</h1>
          <p className="text-xs text-neutral-500">
            {isRecording ? `Session #${sessionId} 録音中` : '停止中'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LevelMeter level={level} active={isRecording} />
          {isRecording ? (
            <button
              onClick={stop}
              className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-500 text-sm font-medium"
            >
              停止
            </button>
          ) : (
            <button
              onClick={start}
              disabled={starting}
              className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm font-medium"
            >
              {starting ? '準備中...' : '録音開始'}
            </button>
          )}
        </div>
      </header>

      <div ref={listRef} className="flex-1 overflow-auto px-6 py-4 space-y-3">
        {finals.length === 0 && !partial && (
          <p className="text-neutral-600 text-sm">録音を開始すると結果がここに表示されます</p>
        )}
        {finals.map((f) => (
          <div key={f.id} className="flex gap-3">
            {f.speakerId && (
              <span className="text-xs text-neutral-500 mt-1 w-14 shrink-0">{f.speakerId}</span>
            )}
            <div className="flex-1">
              <span className="text-xs text-neutral-600 mr-2">{formatMs(f.startMs)}</span>
              <span className="text-neutral-100">{f.text}</span>
            </div>
          </div>
        ))}
        {partial && (
          <div className="flex gap-3">
            <span className="text-xs text-neutral-600 mt-1 w-14 shrink-0">…</span>
            <div className="flex-1 text-neutral-500 italic">{partial.text}</div>
          </div>
        )}
      </div>
    </div>
  )
}

function LevelMeter({ level, active }: { level: number; active: boolean }) {
  const width = Math.min(100, Math.round(level * 400))
  return (
    <div className="w-24 h-2 bg-neutral-800 rounded overflow-hidden">
      <div
        className={`h-full transition-all ${active ? 'bg-emerald-500' : 'bg-neutral-700'}`}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
