// 話者分離（MVP）
//
// 第一弾: 発話間の無音ギャップと平均音量の変化から「話者ターン」を推定する極めて簡易な実装。
//         厳密な話者識別はできないが、「さっきとは別の人が話し始めた」レベルの区別はつく。
//
// 本格版（TODO）:
//   1. sherpa-onnx-node で CAM++ / 3D-Speaker の話者埋め込み（Embedding）を抽出
//   2. オンライン AHC（Agglomerative Hierarchical Clustering）または
//      オンライン VB-HMM で話者クラスタに割り当て
//   3. 話者 ID は 'spk_0', 'spk_1', ... として永続化
//
// モデル: https://github.com/k2-fsa/sherpa-onnx/tree/master/sherpa-onnx/models
// 参考: 3dspeaker_speech_eres2net_base_sv_zh-cn_16k-common

const NEW_SPEAKER_GAP_MS = 1200
const ENERGY_DIFF_THRESHOLD = 0.3

export class DiarizationTracker {
  private lastEndMs = 0
  private lastEnergy = 0
  private currentSpeaker = 0
  private totalSpeakers = 1

  assign(pcm: Float32Array, startMs: number, endMs: number): string {
    const energy = calcEnergy(pcm)
    const gap = startMs - this.lastEndMs
    const energyRatio = this.lastEnergy > 0 ? Math.abs(energy - this.lastEnergy) / this.lastEnergy : 0

    // 長い無音 or 音量特性が大きく変わった → 別話者と推定
    const isNewSpeaker =
      this.lastEndMs > 0 &&
      (gap > NEW_SPEAKER_GAP_MS || energyRatio > ENERGY_DIFF_THRESHOLD)

    if (isNewSpeaker) {
      // 既存話者のうちエネルギー特性が近いものへ戻すのが理想だが、MVP では単純に切り替え
      this.currentSpeaker = (this.currentSpeaker + 1) % Math.max(2, this.totalSpeakers)
      if (this.currentSpeaker === this.totalSpeakers) this.totalSpeakers++
    }

    this.lastEndMs = endMs
    this.lastEnergy = energy
    return `spk_${this.currentSpeaker}`
  }
}

function calcEnergy(buf: Float32Array): number {
  let sum = 0
  for (let i = 0; i < buf.length; i++) sum += Math.abs(buf[i])
  return sum / buf.length
}
