---
md_class: history
id: design-route-and-train-movement
type: design
status: review
created: 2026-08-09
epic: epic-phase-minus-one
task: task-route-and-train-movement-prototype
---

# Design: 駅間経路と列車移動

## 決定

線路ごとに接続点と駅停車位置を距離順の節点へ変換し、隣接節点を線路長で結ぶ。`TrackJunction`の参加口同士を距離0で結び、Dijkstra法で駅間最短経路を求める。一駅が複数線路に停車地点を持つ場合は全停車地点を候補にする。

運行経路は停車駅IDの順序と駅間探索結果を保持する。列車は既存Fleetモデルの編成を将来統合できるよう`formationId`を参照し、Phase -1 UIでは文字列IDを指定する。

列車位置は経路内の累積距離で進め、途中駅で一定時間停止し、終着で完了する。信号・閉塞・他列車との競合は扱わない。
