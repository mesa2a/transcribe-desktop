# Transcribe Desktop

Windows 向けのリアルタイム文字起こしデスクトップアプリ。whisper.cpp をエッジで動かし、録音中に逐次テキスト化します。話者分離、全文検索、設定画面まで含みます。

## 主な機能

- リアルタイム文字起こし（部分結果のストリーミング表示）
- Vulkan / CUDA による GPU アクセラレーション
- 話者分離（MVP 実装 + sherpa-onnx による本格実装への拡張余地）
- SQLite FTS5 による全文検索
- セッション履歴管理
- 複数モデル切り替え（tiny 〜 large-v3）

## アーキテクチャ概要

```
┌──────────────────────────────────────────────────────┐
│  Renderer (React + TypeScript)                       │
│  ├─ getUserMedia → AudioWorklet (16kHz 化)           │
│  └─ 部分/確定結果の表示                              │
└──────────────────────────────────────────────────────┘
         │ IPC (contextBridge)
┌──────────────────────────────────────────────────────┐
│  Main (Node.js)                                      │
│  ├─ StreamingSession: リングバッファ + VAD           │
│  ├─ WhisperEngine: @fugood/whisper.node ラッパ       │
│  ├─ DiarizationTracker: 話者分離                     │
│  └─ better-sqlite3 + FTS5                            │
└──────────────────────────────────────────────────────┘
```

## セットアップ（Windows）

### 必要なもの

1. **Node.js v20+** — https://nodejs.org/
2. **Visual Studio Build Tools** — C++ ワークロードを含めてインストール
   - https://visualstudio.microsoft.com/visual-cpp-build-tools/
   - ネイティブモジュール（`@fugood/whisper.node`、`better-sqlite3`）のビルドに必須
3. **Python 3.x** — node-gyp が必要とする
4. **GPU を使う場合**:
   - Vulkan: Vulkan SDK (通常は不要、ドライバに含まれる)
   - CUDA: CUDA Toolkit 12.x (NVIDIA GPU のみ)

### インストール

```powershell
npm install
```

ネイティブモジュールのビルドで数分かかります。

### 開発実行

```powershell
npm run dev
```

起動したら、設定画面で「選択中のモデルをダウンロード」を一度実行してください。初回のみ Hugging Face から ggml モデルを取得します（base モデルで約 74MB）。

### モデル選択ガイド

| モデル | サイズ | 用途 | 推奨環境 |
|--------|--------|------|----------|
| **tiny** | 39MB | テスト・最速 | 低スペックPC、英語のみ |
| **base** | 74MB | 開発用 | エントリーPC、精度は低い |
| **small** | 244MB | **バランス型（推奨）** | 一般的なPC、日本語で実用的 |
| **medium** | 769MB | 高精度 | ハイスペックPC |
| **large-v3-turbo** | 809MB | **最高精度・高速** | ハイスペックPC、GPU推奨 |
| **large-v3** | 1.5GB | 最高精度 | ワークステーション級 |

**日本語の文字起こしには `small` 以上を推奨します。** `base` や `tiny` は日本語で幻覚（存在しないフレーズ）が発生しやすいです。

**ハイスペックPC（専用GPU搭載）の場合**: `large-v3-turbo` + CUDA バックエンドで最高の精度とリアルタイム性を両立できます。

### 配布ビルド

```powershell
npm run package
```

`dist/` に NSIS インストーラ（.exe）が生成されます。

## ディレクトリ構成

```
src/
├── main/                # Electron メインプロセス（Node.js）
│   ├── index.ts         # エントリ
│   ├── ipc.ts           # IPC ハンドラ
│   ├── config.ts        # electron-store による設定永続化
│   ├── db/              # SQLite + FTS5
│   ├── models/          # モデルダウンローダ
│   └── transcription/   # Whisper / ストリーミング / 話者分離
├── preload/             # contextBridge で API を露出
├── shared/              # 共通型定義
└── renderer/            # React UI
    ├── pages/           # Record / History / Search / Settings
    ├── components/
    ├── lib/             # audio.ts, api.ts
    └── worklets/        # pcm-worklet.js (16kHz ダウンサンプラ)
```

## 実装メモと既知の制約

### ストリーミング方式

whisper.cpp 自体は真のストリーミング設計ではないため、本アプリでは「スライディングウィンドウ + VAD」による擬似ストリーミングで部分結果を出しています。具体的には:

- `partial`: 800ms ごとに現在のバッファ全体を再認識して暫定テキストを出す
- `final`: VAD が 700ms 以上の無音を検出したら発話区切りとみなし確定

そのため認識品質・レイテンシの両立には限界があります。本気でリアルタイム性を追求するなら、RNN-T / Conformer 系のストリーミング用モデル（NVIDIA Riva、sherpa-onnx の Zipformer など）への差し替えが理想です。

### 話者分離

MVP は「無音ギャップ + 音量エンベロープ」ベースの簡易実装です。正確な話者識別には `sherpa-onnx-node` と CAM++ / 3D-Speaker の話者埋め込みモデルの導入が必要です。`src/main/transcription/diarization.ts` に拡張方針のコメントを残してあります。

### VAD

現在は RMS ベースの極めて単純な実装です。Silero VAD（`@fugood/whisper.node` が `initWhisperVad` として提供）に差し替えると精度が上がります。

## よくある問題

- **`npm install` がビルドエラーで止まる**: Visual Studio Build Tools の C++ ワークロードが入っているか確認
- **GPU が使われない**: 設定画面で GPU バックエンドを Vulkan に切り替え。NVIDIA の場合は CUDA
- **モデル DL が遅い/失敗する**: Hugging Face から直接手動で `ggml-base.bin` をダウンロードし、`%APPDATA%/transcribe-desktop/models/` に配置しても OK

## ライセンス

このテンプレート自体は自由に利用してください。whisper.cpp / ggml / モデル側のライセンスは各配布元を確認のこと。
