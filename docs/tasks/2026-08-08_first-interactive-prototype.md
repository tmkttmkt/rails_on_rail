---
md_class: history
id: task-first-interactive-prototype
type: task
created: 2026-08-08
status: cancelled
owners:
  - codex
relations:
  - design-first-interactive-prototype
epic: epic-phase-minus-one
---

# Task: 最初の操作可能な鉄道プロトタイプ

## 目的・背景

企画文書だけの状態から、Rails on Railの中核操作をブラウザで体験できる最初の形を作る。

## 責任範囲

- ViteとTypeScriptによる実行・ビルド環境
- Canvas上の駅設置、線路敷設、列車配置
- 線路グラフ上の経路探索
- 経路に沿った列車移動
- JSON相当の状態保存と復元
- シミュレーション層の自動テスト

## 対象外

- 現実の地図と地理座標
- 需要、収支、規格、信号、ダイヤ
- 完成版のUIとセーブファイル管理

## 完了条件

- [x] `npm run build`が成功する
- [x] 自動テストが成功する
- [ ] ブラウザで駅、線路、列車を作成できる
- [x] 列車へ目的地を指定すると、探索された経路に沿って移動する
- [x] 状態をブラウザへ保存し、復元できる
- [x] UIがシミュレーションの共通操作命令を使用する

## 方針・判断

外部地図やUIフレームワークの選定を急がず、依存の少ないCanvasとDOMで操作ループを検証する。

## 関連文書

- [Phase -1 Epic](../epics/phase-minus-one.md)
- [Design](../designs/first-interactive-prototype.md)

## 検証方法

- TypeScriptビルド
- シミュレーションの単体テスト
- ブラウザでの人間による操作確認

## 作業結果

- Vite、TypeScript、Vitestの開発環境を追加した。
- DOMから独立した状態、操作命令、経路探索、時間進行を実装した。
- Canvas UIから共通操作命令を呼び出す操作画面を実装した。
- ブラウザ内保存、デモ路線、速度変更を実装した。
- 当時の現在仕様として`features/interactive-network-prototype.md`を作成したが、Task中止に伴い現行Featureから削除した。

## 検証結果

- `npm run test`: 4件成功
- `npm run build`: 成功
- 開発サーバーへのHTTPアクセス: 200
- ブラウザ操作: セッションに利用可能なブラウザがなく未実施

## 未確認事項・残作業

- 駅と列車を含む方式は、自由なマップ上の線路敷設を先に検証する方針へ変更した。
- 後継Taskは[自由マップ線路敷設プロトタイプ](2026-08-08_free-map-track-building.md)。

## 引き継ぎ

このTaskの実装は現行仕様として残さない。設計判断の履歴は保持し、後継Taskで置き換える。
