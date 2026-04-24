import path from 'node:path'
import { app } from 'electron'
import type { AppSettings } from '../../shared/types'

// @fugood/whisper.node をラップしたシングルトンエンジン
// - 初回 ready 時にモデルをロードし、以降は再利用
// - 設定変更時はリロード

type WhisperContext = {
  transcribeData: (
    buf: ArrayBuffer,
    opts: {
      language?: string
      temperature?: number
      nThreads?: number
      maxLen?: number
    }
  ) => { stop: () => void; promise: Promise<{ result: { text: string; t0: number; t1: number }[] }> }
  release: () => Promise<void>
}

class WhisperEngine {
  private ctx: WhisperContext | null = null
  private loadedKey = ''

  private keyFor(s: AppSettings) {
    return `${s.modelName}|${s.useGpu}|${s.gpuBackend}`
  }

  /** 必要ならモデルをロードする */
  async ready(settings: AppSettings) {
    const key = this.keyFor(settings)
    if (this.ctx && this.loadedKey === key) return

    if (this.ctx) {
      await this.ctx.release()
      this.ctx = null
    }

    // dynamic import して ESM/CJS の差異を回避
    const { initWhisper } = await import('@fugood/whisper.node')

    const modelPath = path.join(app.getPath('userData'), 'models', `ggml-${settings.modelName}.bin`)
    const libVariant = settings.useGpu ? settings.gpuBackend : 'default'

    // CPU スレッド数を自動検出（論理コア数の75%を使用）
    const os = await import('node:os')
    const cpuCount = os.cpus().length
    const optimalThreads = Math.max(4, Math.floor(cpuCount * 0.75))

    this.ctx = (await initWhisper(
      { filePath: modelPath, useGpu: settings.useGpu, nThreads: optimalThreads },
      libVariant
    )) as WhisperContext

    this.loadedKey = key
  }

  /**
   * PCM (Float32, 16kHz, mono) を 16-bit PCM に変換して認識する。
   * 部分結果の概念は内部的には無いので、呼び出し側（streaming.ts）が
   * スライディングウィンドウで擬似的に partial を出す運用にする。
   */
  async transcribe(
    pcm: Float32Array,
    opts: { language: string }
  ): Promise<{ text: string; t0: number; t1: number }[]> {
    if (!this.ctx) throw new Error('Whisper not initialized')

    // Float32 → Int16 変換
    const i16 = new Int16Array(pcm.length)
    for (let i = 0; i < pcm.length; i++) {
      const s = Math.max(-1, Math.min(1, pcm[i]))
      i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }

    // 推論時のスレッド数も最適化
    const os = await import('node:os')
    const cpuCount = os.cpus().length
    const optimalThreads = Math.max(4, Math.floor(cpuCount * 0.75))

    const { promise } = this.ctx.transcribeData(i16.buffer, {
      language: opts.language === 'auto' ? undefined : opts.language,
      temperature: 0.0,
      nThreads: optimalThreads
    })
    const response = await promise
    // console.log('[transcribe] response:', JSON.stringify(response, null, 2))

    // segments 配列を返す（result は文字列の全体テキスト）
    if (response.segments && Array.isArray(response.segments)) {
      return response.segments.map((seg: { text: string; t0: number; t1: number }) => ({
        text: seg.text,
        t0: seg.t0,
        t1: seg.t1
      }))
    } else if (typeof response.result === 'string') {
      // segments がない場合は result 文字列を使用
      return [{ text: response.result, t0: 0, t1: 0 }]
    } else {
      console.error('[transcribe] unexpected result format:', response)
      return []
    }
  }

  async shutdown() {
    if (this.ctx) {
      await this.ctx.release()
      this.ctx = null
      this.loadedKey = ''
    }
  }
}

let _engine: WhisperEngine | null = null
export function getEngine() {
  if (!_engine) _engine = new WhisperEngine()
  return _engine
}
