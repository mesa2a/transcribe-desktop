// 型定義（メイン/レンダラー共通）

export interface Segment {
  id: number
  sessionId: number
  speakerId: string | null
  startMs: number
  endMs: number
  text: string
  isFinal: boolean
  createdAt: string
}

export interface Session {
  id: number
  title: string
  startedAt: string
  endedAt: string | null
  durationMs: number
  language: string
}

export interface PartialResult {
  sessionId: number
  speakerId: string | null
  startMs: number
  endMs: number
  text: string
}

export interface FinalResult extends PartialResult {
  id: number
}

export interface AppSettings {
  modelName: 'tiny' | 'base' | 'small' | 'medium' | 'large-v3' | 'large-v3-turbo'
  language: string // 'auto' | 'ja' | 'en' | ...
  useGpu: boolean
  gpuBackend: 'cuda' | 'vulkan' | 'cpu'
  vadThreshold: number
  enableDiarization: boolean
  inputDeviceId: string | null
}

export interface ModelDownloadProgress {
  modelName: string
  loadedBytes: number
  totalBytes: number
  done: boolean
}

// preload で公開される API
export interface TranscribeAPI {
  // セッション制御
  startSession(): Promise<number>
  stopSession(sessionId: number): Promise<void>

  // 音声チャンク投入（レンダラーから PCM を流し込む）
  pushAudioChunk(sessionId: number, pcm: Float32Array): Promise<void>

  // DB
  listSessions(): Promise<Session[]>
  getSegments(sessionId: number): Promise<Segment[]>
  searchTranscripts(query: string): Promise<Array<Segment & { sessionTitle: string }>>
  deleteSession(sessionId: number): Promise<void>
  renameSession(sessionId: number, title: string): Promise<void>

  // 設定
  getSettings(): Promise<AppSettings>
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>

  // モデル管理
  ensureModel(): Promise<void>
  onModelProgress(cb: (p: ModelDownloadProgress) => void): () => void

  // 認識結果のストリーム購読
  onPartial(cb: (r: PartialResult) => void): () => void
  onFinal(cb: (r: FinalResult) => void): () => void

  // デバイス
  listAudioInputs(): Promise<Array<{ deviceId: string; label: string }>>
}

declare global {
  interface Window {
    api: TranscribeAPI
  }
}
