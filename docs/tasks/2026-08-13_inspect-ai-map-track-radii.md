---
md_class: history
id: task-inspect-ai-map-track-radii
type: task
created: 2026-08-13
status: done
owners:
  - codex
relations:
  - task-explicit-save-server-sync
  - task-curve-radius-and-cant
epic: epic-phase-minus-one
---

# Task: AI生成マップの確定前に線路別最小半径を確認する

## 目的・背景

AIが生成したマップをサーバーセーブとして確定する前に、各線路パーツの実際の点列から最小半径を計算し、AIと人間が確認できる応答を返す。

## 責任範囲

- 保存を行わない半径検査API
- 線路ID、線形種別、線路別最小半径、マップ全体の最小半径の応答
- AIクライアントから検査を呼び出す関数
- AI外部操作ガイドの更新

## 対象外

- 最小半径による保存の自動拒否
- 許容半径の規格判定
- AI生成マップの自動修正

## 完了条件

- [x] AIがセーブ確定前に書き込みなしで半径検査できる
- [x] 各線路パーツの最小半径が応答される
- [x] 直線は無限半径を表す`null`として区別される
- [x] API実通信を確認する

## 実装結果

- `POST /api/server-saves/inspect`を追加した。
- 保存済みの`engineering.builtMinimumRadiusM`を信用せず、各線路の点列から再計算する。
- `RailsAiClient.inspectSave`から検査結果を取得できる。

## 検証結果

- `npm run build`: 成功。
- 開発サーバーの`POST /api/server-saves/inspect`へ既存AI生成セーブを送信し、2線路それぞれの結果と全体最小半径が返ることを確認した。
- 検査APIは保存APIを呼ばず、セーブファイルを書き込まない。

## 未確認事項・残作業

- なし。大規模AI生成マップで検査結果を提示し、ユーザー確認後にサーバーセーブへ確定する流れを確認した。
