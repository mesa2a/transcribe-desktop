// AudioWorklet: マイクの音声を 16kHz モノラルにダウンサンプルし、
// 一定サンプル数まとめてメインスレッドへ転送する。
//
// AudioContext のサンプルレート（多くは 48000 Hz）から 16000 Hz へ変換するため
// 線形補間でリサンプリングする。簡易実装だが Whisper の認識には十分。

class PCMWorklet extends AudioWorkletProcessor {
  constructor() {
    super()
    this.targetSampleRate = 16000
    this.chunkSize = 3200 // 16kHz 換算で 200ms
    this.buffer = new Float32Array(0)
  }

  static get parameterDescriptors() { return [] }

  process(inputs) {
    const input = inputs[0]
    if (!input || input.length === 0) return true
    const ch0 = input[0]
    if (!ch0) return true

    // 入力 sampleRate (AudioWorklet のグローバル) → 16000 Hz にダウンサンプル
    const ratio = sampleRate / this.targetSampleRate
    const outLen = Math.floor(ch0.length / ratio)
    const out = new Float32Array(outLen)
    for (let i = 0; i < outLen; i++) {
      const src = i * ratio
      const i0 = Math.floor(src)
      const i1 = Math.min(i0 + 1, ch0.length - 1)
      const t = src - i0
      out[i] = ch0[i0] * (1 - t) + ch0[i1] * t
    }

    // バッファに貯める
    const merged = new Float32Array(this.buffer.length + out.length)
    merged.set(this.buffer, 0)
    merged.set(out, this.buffer.length)
    this.buffer = merged

    // chunkSize ごとに送出
    while (this.buffer.length >= this.chunkSize) {
      const chunk = this.buffer.slice(0, this.chunkSize)
      this.buffer = this.buffer.slice(this.chunkSize)
      // Transferable で送ってコピーコストを避ける
      this.port.postMessage(chunk, [chunk.buffer])
    }
    return true
  }
}

registerProcessor('pcm-worklet', PCMWorklet)
