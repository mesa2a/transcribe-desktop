import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { listMicrophones } from '../lib/audio'
import type { AppSettings, ModelDownloadProgress } from '@shared/types'

// 設定画面: モデル・言語・GPU バックエンド・マイク・話者分離

export default function Settings() {
  const [s, setS] = useState<AppSettings | null>(null)
  const [mics, setMics] = useState<Array<{ deviceId: string; label: string }>>([])
  const [progress, setProgress] = useState<ModelDownloadProgress | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getSettings().then(setS)
    listMicrophones().then(setMics)
    const off = api.onModelProgress(setProgress)
    return off
  }, [])

  async function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    if (!s) return
    const next = await api.updateSettings({ [key]: value } as Partial<AppSettings>)
    setS(next)
  }

  async function downloadModel() {
    setSaving(true)
    try {
      await api.ensureModel()
    } catch (e) {
      alert(`ダウンロード失敗: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  if (!s) return <div className="p-6 text-neutral-500">読み込み中...</div>

  return (
    <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">
      <h1 className="text-lg font-medium">設定</h1>

      <Section title="モデル">
        <Row label="モデルサイズ">
          <select
            value={s.modelName}
            onChange={(e) => update('modelName', e.target.value as AppSettings['modelName'])}
            className="bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 text-sm"
          >
            <option value="tiny">tiny (39MB, 最速/精度低)</option>
            <option value="base">base (74MB, 開発用)</option>
            <option value="small">small (244MB, 推奨)</option>
            <option value="medium">medium (769MB)</option>
            <option value="large-v3">large-v3 (1.5GB, 最高精度)</option>
            <option value="large-v3-turbo">large-v3-turbo (809MB, 高精度・高速)</option>
          </select>
        </Row>
        <p className="text-xs text-neutral-500 -mt-2">
          💡 日本語には small 以上を推奨。ハイスペックPC + GPU なら large-v3-turbo が最適
        </p>
        <Row label="言語">
          <select
            value={s.language}
            onChange={(e) => update('language', e.target.value)}
            className="bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 text-sm"
          >
            <option value="auto">自動検出</option>
            <option value="ja">日本語</option>
            <option value="en">英語</option>
            <option value="zh">中国語</option>
            <option value="ko">韓国語</option>
          </select>
        </Row>
        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={downloadModel}
            disabled={saving}
            className="px-3 py-1.5 rounded bg-neutral-700 hover:bg-neutral-600 text-sm disabled:opacity-50"
          >
            選択中のモデルをダウンロード
          </button>
          {progress && (
            <span className="text-xs text-neutral-400">
              {progress.done
                ? '完了'
                : `${formatBytes(progress.loadedBytes)} / ${formatBytes(progress.totalBytes)}`}
            </span>
          )}
        </div>
      </Section>

      <Section title="推論">
        <Row label="GPU を使う">
          <input
            type="checkbox"
            checked={s.useGpu}
            onChange={(e) => update('useGpu', e.target.checked)}
          />
        </Row>
        <Row label="GPU バックエンド">
          <select
            value={s.gpuBackend}
            onChange={(e) => update('gpuBackend', e.target.value as AppSettings['gpuBackend'])}
            disabled={!s.useGpu}
            className="bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 text-sm disabled:opacity-50"
          >
            <option value="vulkan">Vulkan (汎用 GPU)</option>
            <option value="cuda">CUDA (NVIDIA)</option>
            <option value="cpu">CPU のみ</option>
          </select>
        </Row>
      </Section>

      <Section title="入力 & 処理">
        <Row label="マイク">
          <select
            value={s.inputDeviceId ?? ''}
            onChange={(e) => update('inputDeviceId', e.target.value || null)}
            className="bg-neutral-900 border border-neutral-800 rounded px-3 py-1.5 text-sm max-w-sm"
          >
            <option value="">デフォルト</option>
            {mics.map((m) => (
              <option key={m.deviceId} value={m.deviceId}>
                {m.label}
              </option>
            ))}
          </select>
        </Row>
        <Row label="話者分離">
          <input
            type="checkbox"
            checked={s.enableDiarization}
            onChange={(e) => update('enableDiarization', e.target.checked)}
          />
        </Row>
        <Row label="VAD 閾値">
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={s.vadThreshold}
            onChange={(e) => update('vadThreshold', parseFloat(e.target.value))}
          />
          <span className="text-xs text-neutral-400 ml-2">{s.vadThreshold.toFixed(2)}</span>
        </Row>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-neutral-800 rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-medium text-neutral-300">{title}</h2>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-sm text-neutral-400">{label}</label>
      <div className="flex items-center">{children}</div>
    </div>
  )
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}
