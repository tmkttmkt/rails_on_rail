---
md_class: history
id: task-steam-operations-test-map
type: task
created: 2026-08-11
status: done
owners:
  - codex
relations:
  - task-route-and-train-movement-prototype
  - task-map-save-and-load
epic: epic-phase-minus-one
---

# Task: 蒸気機関車運用テストマップを生成する

## 目的・背景

蒸気機関車牽引列車の本線往復、待避、折返し、支線、貨物、機関区出入を将来検証できる線路構成を、現行の`MapState version 8`で再現可能なセーブJSONとして用意する。

## 責任範囲

- 蒸気機関車運用を想定した線路、駅、接続点、運行経路
- 再生成可能なスクリプト
- 保存形式の検証と全運行経路の走破確認

## 対象外

- 未実装の勾配・標高
- 給水塔、給炭設備、灰捨場、転車台の設備オブジェクト
- 機回し・入換の専用命令
- 車両個体・編成と運行列車の統合

## 生成内容

- 1067 mm軌間、JIS 37A、木枕木バラスト軌道
- 本線3区間、3か所の待避・機回し用ループ
- 将来の勾配試験を想定した低速山岳支線
- 西港機関区を想定した機関車導入線と3本の作業線
- 東野貨物ヤードを想定した引上線と2本の貨物線
- 8駅、往復本線・往復山岳支線・貨物の5運行経路

## 成果物

- `saves/steam-locomotive-operations-test.json`
- `scripts/generate-steam-operations-map.ts`

## 検証結果

- 生成時に`parseSaveFile`で保存JSONを再読込: 成功
- 5運行経路すべてへ試験列車を配置し、終着まで時間を進める走破確認: 成功
- `npm run test`: 成功
- `npm run build`: 成功
- ブラウザ表示: 実行環境に利用可能なブラウザがなく未確認

## 未確認事項・残作業

- 人間がブラウザへJSONを取り込み、線路配置、駅範囲、経路選択の使いやすさを確認する。
- 勾配、蒸気設備、機回し命令が実装された後、このマップへ設備状態と勾配プロファイルを追加する。
