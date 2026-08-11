---
md_class: history
id: design-track-junction-topology
type: design
created: 2026-08-09
status: review
epic: epic-phase-minus-one
task: task-stabilize-track-topology-and-docs
---

# Design: 独立した線路接続点

## 決定

線路網の接続の正本を、線路が相手線路を片方向参照する方式から、独立した`TrackJunction`へ変更する。

```text
TrackJunction
  ├─ position
  └─ ports[]
       ├─ trackId
       ├─ location: start | end | interior
       └─ distanceM
```

一つの接続点へ複数線路が参加できるため、端点接続、途中分岐、合流を同じ構造で表現できる。参加線路のどちら側からも接続点を検索できる。

`Track.startConnection`と`Track.endConnection`は既存UIと保存移行の互換情報として当面残すが、経路探索では`junctions`を正本にする。

## 保存

ゲーム状態をversion 3とする。version 1は個別線路へ展開した後に接続点を生成し、version 2は既存の始終端接続から接続点を生成する。

## 制約

- 分岐器の物理形状と番数はまだ持たない
- 一点交差は自動的に接続点としない
- 接続点の編集UIはまだ持たない

