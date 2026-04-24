import { EventEmitter } from 'node:events'
import { getEngine } from './engine'
import { DiarizationTracker } from './diarization'
import { db } from '../db'
import { getConfig } from '../config'
import type { FinalResult, PartialResult } from '../../shared/types'

// ストリーミング処理の中核
// - レンダラーから来る PCM チャンクをリングバッファに貯める
// - VAD（ここでは RMS ベースの簡易版）で無音の長さを検出
// - 無音が一定以上続いたら「発話区切り」として最終認識を実行
// - それとは別に、一定間隔で現在のバッファを認識して partial として返す
//
// 本気の実装では Silero VAD（ONNX）を使うべき。MVP としては RMS で十分実用になる。

const SAMPLE_RATE = 16000
const WINDOW_MS = 8_000 // 最大スライディングウィンドウ（8秒に短縮）
const PARTIAL_INTERVAL_MS = 1200 // partial を出す間隔（少し長めに）
const SILENCE_FINALIZE_MS = 400 // これだけ無音が続いたら確定（さらに短縮）
const MIN_UTTERANCE_MS = 250 // 最低発話長（さらに短縮）

type StreamEvents = {
  partial: (r: PartialResult) => void
  final: (r: FinalResult) => void
}

export class StreamingSession extends EventEmitter {
  public readonly startEpoch = Date.now()
  private buffer: Float32Array = new Float32Array(0)
  private bufferStartMs = 0 // バッファ先頭がセッション開始から何 ms か
  private isRunning = true
  private lastPartialAt = 0
  private lastVoiceAt = 0 // 最後に「音声あり」だった時刻 (セッション ms)
  private inUtterance = false
  private utteranceStartMs = 0
  private diar = new DiarizationTracker()
  private partialTimer: NodeJS.Timeout | null = null

  constructor(public readonly sessionId: number) {
    super()
    // 定期的に partial を吐くループ
    this.partialTimer = setInterval(() => this.maybeEmitPartial(), PARTIAL_INTERVAL_MS)
  }

  async push(pcm: Float32Array) {
    if (!this.isRunning) return

    // バッファへ append
    const merged = new Float32Array(this.buffer.length + pcm.length)
    merged.set(this.buffer, 0)
    merged.set(pcm, this.buffer.length)
    this.buffer = merged

    // バッファが長すぎたら古い方を削る（リングバッファ的に）
    const maxSamples = (WINDOW_MS / 1000) * SAMPLE_RATE
    if (this.buffer.length > maxSamples) {
      const drop = this.buffer.length - maxSamples
      this.buffer = this.buffer.slice(drop)
      this.bufferStartMs += (drop / SAMPLE_RATE) * 1000
    }

    // VAD
    const nowMs = Date.now() - this.startEpoch
    const rms = calcRms(pcm)
    const vadThreshold = getConfig().vadThreshold || 0.5
    // 閾値をスケーリング（0.5 → 0.02の範囲）
    const threshold = 0.01 + (vadThreshold * 0.02)
    const voiceActive = rms > threshold
    if (voiceActive) {
      this.lastVoiceAt = nowMs
      if (!this.inUtterance) {
        this.inUtterance = true
        this.utteranceStartMs = nowMs - (pcm.length / SAMPLE_RATE) * 1000
      }
    } else if (
      this.inUtterance &&
      nowMs - this.lastVoiceAt > SILENCE_FINALIZE_MS &&
      nowMs - this.utteranceStartMs > MIN_UTTERANCE_MS
    ) {
      this.inUtterance = false
      await this.finalize(this.utteranceStartMs, nowMs)
    }
  }

  /** バッファ末尾を使った部分認識 */
  private async maybeEmitPartial() {
    if (!this.isRunning || !this.inUtterance) return
    const now = Date.now()
    if (now - this.lastPartialAt < PARTIAL_INTERVAL_MS) return
    this.lastPartialAt = now
    if (this.buffer.length < SAMPLE_RATE * 0.4) return

    try {
      const results = await getEngine().transcribe(this.buffer, {
        language: getConfig().language
      })
      const text = results.map((r) => r.text).join('').trim()

      // フィルタリング: BLANK_AUDIO や一般的な幻覚フレーズを除外
      if (!text || isHallucination(text)) return

      this.emit('partial', {
        sessionId: this.sessionId,
        speakerId: null,
        startMs: this.utteranceStartMs,
        endMs: Date.now() - this.startEpoch,
        text
      })
    } catch (err) {
      console.error('[partial] error', err)
    }
  }

  /** 発話区切りで確定認識 → DB 永続化 → final イベント */
  private async finalize(startMs: number, endMs: number) {
    if (this.buffer.length < SAMPLE_RATE * 0.2) return
    try {
      const results = await getEngine().transcribe(this.buffer, {
        language: getConfig().language
      })
      const text = results.map((r) => r.text).join('').trim()

      // フィルタリング: BLANK_AUDIO や一般的な幻覚フレーズを除外
      if (!text || isHallucination(text)) return

      const speakerId = getConfig().enableDiarization
        ? this.diar.assign(this.buffer, startMs, endMs)
        : null

      const info = db
        .prepare(
          `INSERT INTO segments (session_id, speaker_id, start_ms, end_ms, text, is_final)
           VALUES (?, ?, ?, ?, ?, 1)`
        )
        .run(this.sessionId, speakerId, startMs, endMs, text)

      this.emit('final', {
        id: Number(info.lastInsertRowid),
        sessionId: this.sessionId,
        speakerId,
        startMs,
        endMs,
        text
      })

      // 確定したのでバッファクリア（次の発話用）
      this.buffer = new Float32Array(0)
      this.bufferStartMs = endMs
    } catch (err) {
      console.error('[finalize] error', err)
    }
  }

  async flush() {
    if (this.inUtterance) {
      await this.finalize(this.utteranceStartMs, Date.now() - this.startEpoch)
    }
  }

  dispose() {
    this.isRunning = false
    if (this.partialTimer) clearInterval(this.partialTimer)
    this.removeAllListeners()
  }
}

function calcRms(buf: Float32Array): number {
  let sum = 0
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
  return Math.sqrt(sum / buf.length)
}

/** Whisper の一般的な幻覚フレーズを検出 */
function isHallucination(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[^\w\s]/g, '')

  // 一般的な幻覚フレーズ（日本語・英語）
  const hallucinationPatterns = [
    'blank_audio',
    'ご視聴ありがとう',
    'また次の動画',
    'チャンネル登録',
    'high subscri',
    'like and subscri',
    'thanks for watching',
    'see you next time',
    '字幕',
    'サブタイトル',
    '音楽',
    '拍手',
    '笑',
    'ブルー',
    'パッパッ',
    // 短すぎるノイズ
    /^[^\w]{1,3}$/,
    // 単一の短い相槌の繰り返し
    /^(はい|うん|ええ|あ|お){1,3}$/
  ]

  for (const pattern of hallucinationPatterns) {
    if (pattern instanceof RegExp) {
      if (pattern.test(normalized)) return true
    } else if (normalized.includes(pattern)) {
      return true
    }
  }

  // テキストが短すぎる（5文字以下）かつ、同じ文字の繰り返しが多い場合
  if (text.length <= 5) {
    const chars = text.split('')
    const uniqueChars = new Set(chars)
    // ユニーク文字が2種類以下なら幻覚と判定
    if (uniqueChars.size <= 2) return true
  }

  return false
}

// セッション ID → インスタンスの簡易レジストリ
const registry = new Map<number, StreamingSession>()
export function getStreamingSession(id: number): StreamingSession {
  let s = registry.get(id)
  if (!s) {
    s = new StreamingSession(id)
    registry.set(id, s)
    s.once('close', () => registry.delete(id))
  }
  return s
}

// 型補助
export interface StreamingSession {
  on<E extends keyof StreamEvents>(event: E, listener: StreamEvents[E]): this
  emit<E extends keyof StreamEvents>(event: E, ...args: Parameters<StreamEvents[E]>): boolean
}
