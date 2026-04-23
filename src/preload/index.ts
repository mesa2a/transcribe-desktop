import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  TranscribeAPI,
  ModelDownloadProgress,
  PartialResult,
  FinalResult
} from '../shared/types'

const api: TranscribeAPI = {
  startSession: () => ipcRenderer.invoke('session:start'),
  stopSession: (id) => ipcRenderer.invoke('session:stop', id),

  pushAudioChunk: (id, pcm) => ipcRenderer.invoke('audio:push', id, pcm),

  listSessions: () => ipcRenderer.invoke('db:sessions'),
  getSegments: (id) => ipcRenderer.invoke('db:segments', id),
  searchTranscripts: (q) => ipcRenderer.invoke('db:search', q),
  deleteSession: (id) => ipcRenderer.invoke('db:delete-session', id),
  renameSession: (id, t) => ipcRenderer.invoke('db:rename-session', id, t),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (p: Partial<AppSettings>) => ipcRenderer.invoke('settings:update', p),

  ensureModel: () => ipcRenderer.invoke('model:ensure'),
  onModelProgress: (cb: (p: ModelDownloadProgress) => void) => {
    const h = (_: unknown, p: ModelDownloadProgress) => cb(p)
    ipcRenderer.on('model:progress', h)
    return () => ipcRenderer.off('model:progress', h)
  },

  onPartial: (cb: (r: PartialResult) => void) => {
    const h = (_: unknown, r: PartialResult) => cb(r)
    ipcRenderer.on('transcribe:partial', h)
    return () => ipcRenderer.off('transcribe:partial', h)
  },
  onFinal: (cb: (r: FinalResult) => void) => {
    const h = (_: unknown, r: FinalResult) => cb(r)
    ipcRenderer.on('transcribe:final', h)
    return () => ipcRenderer.off('transcribe:final', h)
  },

  // マイク一覧はレンダラー側で enumerateDevices を使うため、ここは空配列
  listAudioInputs: async () => []
}

contextBridge.exposeInMainWorld('api', api)
