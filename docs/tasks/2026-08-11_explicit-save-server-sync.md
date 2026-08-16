---
md_class: history
id: task-explicit-save-server-sync
type: task
created: 2026-08-11
status: done
owners:
  - codex
relations:
  - feature-map-save-and-load
  - task-named-save-slots
epic: epic-phase-minus-one
---

# Task: 明示的な保存操作だけでサーバー同期する

## 目的・背景

ブラウザの定期ポーリングを廃止し、新規保存、上書き、JSON取込という人間の明示操作時だけセーブJSONをサーバーへ送る。外部AIはブラウザの状態同期へ依存せず、サーバーのJSON APIを自由に利用する。

## 責任範囲

- ブラウザからの定期APIアクセスの廃止
- 新規保存、上書き、JSON取込時のサーバー同期
- UUIDによるサーバーセーブ識別
- revisionによる上書き競合検出
- AIが独立して利用できるセーブJSON API
- 現在仕様とAI操作ガイドの更新

## 対象外

- JSONを任意APIへ試し送りするブラウザUI
- AI生成結果のブラウザへの自動反映
- セーブJSON同士の自動マージ
- 本番用の認証、権限管理、クラウド保存

## 完了条件

- [x] 通常プレイ中にブラウザがAPIへ定期アクセスしない
- [x] 上部のセーブボタンを押したときだけサーバーセーブを取得して表示する
- [x] セーブ新規作成、上書き、JSON取込時だけサーバーへ同期する
- [x] ローカル保存成功後に同期が失敗してもローカル版を維持する
- [x] 古いrevisionからの上書きをサーバーが拒否する
- [x] AIがセーブ一覧、取得、作成、更新をAPIで行える
- [x] テストと本番ビルドが成功する
- [ ] ブラウザで保存操作時だけ通信することを人間が確認する

## 実装結果

- `setInterval`による`/api/load`、`/api/commands`、`/api/state`アクセスを削除した。
- セーブ管理画面を開く明示操作時だけ、サーバー一覧とセーブJSONを取得するようにした。
- ブラウザ内スロットへ`serverId`と`serverRevision`を保持し、明示的な保存操作時だけ同期するようにした。
- Vite開発サーバーのAPIをセーブJSON交換へ限定し、UUIDファイル名と`.save-index.json`でrevisionを管理するようにした。
- 既存の名前付きJSONはlegacyセーブとして一覧・取得を継続できる。

## 検証方法・結果

- `npm run test`: 16ファイル、194件成功（`.claude/worktrees/`配下の複製テストを含む）
- `npm run build`: 成功
- `GET /api/server-saves`: 開発サーバーをポート5199で起動し、既存5件の一覧を`200 OK`で取得
- ブラウザ操作と通信確認: 人間確認待ち

## 未確認事項・残作業

- 開発者ツールのNetworkで、通常プレイ中にはAPI通信が発生せず、上部のセーブボタンを押したときだけ一覧取得が発生することを確認する。
- 新規保存、上書き、JSON取込時にだけ`POST /api/server-saves`が発生することを確認する。
- JSONを任意のAPIへ試し送りする機能は、送信先、認証情報、レスポンス表示方法を定義して後続Taskとする。
