---
md_class: history
id: task-map-save-and-load
type: task
created: 2026-08-09
status: review
owners:
  - codex
relations:
  - design-map-save-format
  - feature-free-map-track-building
  - feature-map-save-and-load
epic: epic-phase-minus-one
---

# Task: マップの保存と読込

## 目的・背景

作成した線路網をブラウザ内へ保存・復元し、JSONファイルとして持ち出し・取り込みできるようにする。

## 責任範囲

- MapStateのJSON直列化と検証付き復元
- ブラウザ内の簡易保存・読込
- JSONファイルの書出・取込
- 読込後のUI状態初期化
- 自動テストと現在仕様文書

## 対象外

- 複数セーブスロット
- 自動保存
- クラウド保存
- 旧版からの移行
- 圧縮と暗号化

## 完了条件

- [x] マップ状態をJSONへ変換し同じ状態へ復元できる
- [x] 不正なJSONを拒否し現在状態を維持できる
- [x] ブラウザ内へ保存・読込できる
- [x] JSONファイルを書出・取込できる
- [x] テストと本番ビルドが成功する

## 検証方法

- JSON往復、不正形式、未知versionの単体テスト
- `npm run test`
- `npm run build`
- ブラウザで保存、消去、読込、書出、取込を確認

## 作業結果

- `MapState`を検証してJSONへ直列化・復元する処理を実装した。
- `localStorage`を用いた一件の簡易保存と読込を追加した。
- 同じJSON形式のファイル書出と取込を追加した。
- 読込成功時だけマップを置換し、一時的なUI状態を解除するようにした。
- 不正JSON、未知version、不正座標、不正な個別線路を拒否するテストを追加した。

## 検証結果

- `npm run test`: 5ファイル、46件成功
- `npm run build`: 成功
- `git diff --check`: エラーなし
- ブラウザ操作: 利用可能なブラウザがないため人間確認待ち

## 未確認事項・残作業

- ブラウザで保存後にマップを消去し、読込で復元できることを確認する。
- 書き出したJSONを取り込み、同じ線路形状と仕様へ復元できることを確認する。
