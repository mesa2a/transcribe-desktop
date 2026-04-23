import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { getConfig } from '../config'
import type { ModelDownloadProgress } from '../../shared/types'
import { EventEmitter } from 'node:events'

// ggml 形式の Whisper モデルを Hugging Face からダウンロードする
// https://huggingface.co/ggerganov/whisper.cpp

const MODELS = {
  tiny: 'ggml-tiny.bin',
  base: 'ggml-base.bin',
  small: 'ggml-small.bin',
  medium: 'ggml-medium.bin',
  'large-v3': 'ggml-large-v3.bin',
  'large-v3-turbo': 'ggml-large-v3-turbo.bin'
} as const

const BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main'

const emitter = new EventEmitter()
export function onDownloadProgress(cb: (p: ModelDownloadProgress) => void) {
  emitter.on('progress', cb)
  return () => emitter.off('progress', cb)
}

export async function ensureModel(): Promise<void> {
  const { modelName } = getConfig()
  const file = MODELS[modelName]
  const dir = path.join(app.getPath('userData'), 'models')
  fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, file)
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1_000_000) return

  const url = `${BASE_URL}/${file}`
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Failed to download ${url}: ${res.status}`)
  const total = Number(res.headers.get('content-length') ?? 0)

  let loaded = 0
  const tmp = dest + '.tmp'
  const fileStream = fs.createWriteStream(tmp)

  const reader = res.body.getReader()
  await new Promise<void>((resolve, reject) => {
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          loaded += value.byteLength
          if (!fileStream.write(value)) {
            await new Promise((r) => fileStream.once('drain', r))
          }
          emitter.emit('progress', {
            modelName,
            loadedBytes: loaded,
            totalBytes: total,
            done: false
          } as ModelDownloadProgress)
        }
        fileStream.end(() => resolve())
      } catch (e) {
        reject(e as Error)
      }
    }
    pump()
  })

  fs.renameSync(tmp, dest)
  emitter.emit('progress', {
    modelName,
    loadedBytes: loaded,
    totalBytes: total,
    done: true
  } as ModelDownloadProgress)
}
