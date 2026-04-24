import Store from 'electron-store'
import type { AppSettings } from '../shared/types'

const defaults: AppSettings = {
  modelName: 'base',
  language: 'ja',
  useGpu: true,
  gpuBackend: 'vulkan',
  vadThreshold: 0.5,
  enableDiarization: true,
  inputDeviceId: null
}

// electron-store は OS のユーザーデータフォルダに JSON を永続化する
const store = new Store<AppSettings>({ defaults, name: 'settings' })

export function getConfig(): AppSettings {
  return store.store
}

export function updateConfig(patch: Partial<AppSettings>): AppSettings {
  store.set({ ...store.store, ...patch })
  return store.store
}
