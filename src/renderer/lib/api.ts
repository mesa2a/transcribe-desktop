// window.api をそのまま使ってもよいが、import 経路を統一するためのラッパ
import type { TranscribeAPI } from '@shared/types'

export const api: TranscribeAPI = window.api
