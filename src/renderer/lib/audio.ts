import { api } from './api'

// マイクから AudioWorklet を経由して PCM (Float32, 16kHz, mono) を取得し、
// IPC でメインプロセスに流し込むクラス。

export class AudioCapture {
  private stream: MediaStream | null = null
  private ctx: AudioContext | null = null
  private node: AudioWorkletNode | null = null
  private source: MediaStreamAudioSourceNode | null = null

  constructor(
    private sessionId: number,
    private onLevel?: (rms: number) => void
  ) {}

  async start(deviceId: string | null) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    })

    // AudioContext は 48000 Hz になることが多いが、Worklet 側で 16000 にダウンサンプルする
    this.ctx = new AudioContext({ latencyHint: 'interactive' })

    // Worklet モジュールのロード（Vite は ?url でアセット URL を返す）
    const workletUrl = new URL('../worklets/pcm-worklet.js', import.meta.url)
    await this.ctx.audioWorklet.addModule(workletUrl.toString())

    this.node = new AudioWorkletNode(this.ctx, 'pcm-worklet')
    this.source = this.ctx.createMediaStreamSource(this.stream)
    this.source.connect(this.node)
    // 出力は繋がなくてよい（録音専用）

    this.node.port.onmessage = (ev) => {
      const pcm = ev.data as Float32Array
      // レベルメーター用
      if (this.onLevel) {
        let sum = 0
        for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i]
        this.onLevel(Math.sqrt(sum / pcm.length))
      }
      // IPC へ（Electron の IPC は構造化クローンされるのでそのまま渡せる）
      api.pushAudioChunk(this.sessionId, pcm).catch((e) =>
        console.error('pushAudioChunk failed', e)
      )
    }
  }

  async stop() {
    try {
      this.node?.disconnect()
      this.source?.disconnect()
      await this.ctx?.close()
      this.stream?.getTracks().forEach((t) => t.stop())
    } finally {
      this.node = null
      this.source = null
      this.ctx = null
      this.stream = null
    }
  }
}

export async function listMicrophones(): Promise<Array<{ deviceId: string; label: string }>> {
  // ラベルを取得するには一度マイク権限を取る必要がある
  try {
    const tmp = await navigator.mediaDevices.getUserMedia({ audio: true })
    tmp.getTracks().forEach((t) => t.stop())
  } catch {
    /* 権限が拒否された場合は label が空になるだけ */
  }
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices
    .filter((d) => d.kind === 'audioinput')
    .map((d) => ({ deviceId: d.deviceId, label: d.label || '(名前なしデバイス)' }))
}
