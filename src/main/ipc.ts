import { BrowserWindow, ipcMain } from 'electron'
import { db } from './db'
import { getEngine } from './transcription/engine'
import { getStreamingSession } from './transcription/streaming'
import { getConfig, updateConfig } from './config'
import { ensureModel, onDownloadProgress } from './models/downloader'
import type { AppSettings } from '../shared/types'

export function registerIpc(getWin: () => BrowserWindow | null) {
  // -------- セッション制御 --------
  ipcMain.handle('session:start', async () => {
    const settings = getConfig()
    await ensureModel() // モデルが無ければ DL
    const engine = getEngine()
    await engine.ready(settings)

    const info = db
      .prepare(
        `INSERT INTO sessions (title, started_at, language) VALUES (?, ?, ?)`
      )
      .run(`Session ${new Date().toLocaleString()}`, new Date().toISOString(), settings.language)

    const sessionId = Number(info.lastInsertRowid)

    // ストリーミングセッションを初期化し、結果をレンダラーに中継
    const stream = getStreamingSession(sessionId)
    stream.on('partial', (r) => getWin()?.webContents.send('transcribe:partial', r))
    stream.on('final', (r) => getWin()?.webContents.send('transcribe:final', r))

    return sessionId
  })

  ipcMain.handle('session:stop', async (_e, sessionId: number) => {
    const stream = getStreamingSession(sessionId)
    await stream.flush()
    stream.dispose()
    db.prepare(
      `UPDATE sessions SET ended_at = ?, duration_ms = ? WHERE id = ?`
    ).run(new Date().toISOString(), Date.now() - stream.startEpoch, sessionId)
  })

  // -------- 音声チャンク --------
  ipcMain.handle(
    'audio:push',
    async (_e, sessionId: number, pcm: number[] | Float32Array) => {
      // IPC経由だと Float32Array が通常の配列になることがあるので変換
      const float32 = pcm instanceof Float32Array ? pcm : new Float32Array(pcm)
      const stream = getStreamingSession(sessionId)
      await stream.push(float32)
    }
  )

  // -------- DB --------
  ipcMain.handle('db:sessions', () => {
    const rows = db.prepare(`SELECT * FROM sessions ORDER BY started_at DESC`).all() as any[]
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      durationMs: r.duration_ms,
      language: r.language
    }))
  })

  ipcMain.handle('db:segments', (_e, sessionId: number) => {
    const rows = db
      .prepare(`SELECT * FROM segments WHERE session_id = ? ORDER BY start_ms ASC`)
      .all(sessionId) as any[]
    return rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      speakerId: r.speaker_id,
      startMs: r.start_ms,
      endMs: r.end_ms,
      text: r.text,
      isFinal: Boolean(r.is_final),
      createdAt: r.created_at
    }))
  })

  ipcMain.handle('db:search', (_e, query: string) => {
    const rows = db
      .prepare(
        `SELECT s.*, ses.title as sessionTitle
         FROM segments s
         JOIN segments_fts fts ON fts.rowid = s.id
         JOIN sessions ses ON ses.id = s.session_id
         WHERE segments_fts MATCH ?
         ORDER BY s.created_at DESC
         LIMIT 200`
      )
      .all(query) as any[]
    return rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      speakerId: r.speaker_id,
      startMs: r.start_ms,
      endMs: r.end_ms,
      text: r.text,
      isFinal: Boolean(r.is_final),
      createdAt: r.created_at,
      sessionTitle: r.sessionTitle
    }))
  })

  ipcMain.handle('db:delete-session', (_e, sessionId: number) => {
    db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId)
  })

  ipcMain.handle('db:rename-session', (_e, sessionId: number, title: string) => {
    db.prepare(`UPDATE sessions SET title = ? WHERE id = ?`).run(title, sessionId)
  })

  // -------- 設定 --------
  ipcMain.handle('settings:get', () => getConfig())
  ipcMain.handle('settings:update', (_e, patch: Partial<AppSettings>) => updateConfig(patch))

  // -------- モデル --------
  ipcMain.handle('model:ensure', () => ensureModel())
  onDownloadProgress((p) => getWin()?.webContents.send('model:progress', p))
}
