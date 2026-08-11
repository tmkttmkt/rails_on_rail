---
md_class: status
feature: fleet-formations-and-trains
updated: 2026-08-09
epic: epic-phase-minus-one
task: task-fleet-formations-and-trains
---

# 運行会社形式・車両個体・編成・列車

`FleetState`は、メーカー車両設計を参照する運行会社形式、所有する車両個体、車両を並べた編成、複数編成を並べた列車を保持する。

```text
メーカー設計
  → 運行会社形式
  → 車両個体
  → 編成
  → 列車
```

## 編成

編成は車両個体の順序付き一覧で、各車両に`forward`または`reversed`の向きを持つ。車両追加時に隣接端の連結器を検査する。

- 連結器不適合: 操作を拒否
- 貫通ブレーキ不適合: 操作を許可し、`through-brake-discontinuity`警告を保持
- 同じ車両の複数編成所属: 拒否

## 列車

列車は編成の順序付き一覧で、編成ごとに向きと行先駅IDを持つ。編成境界でも連結器と貫通ブレーキを検査する。同じ編成を同時に複数列車へ所属させることはできない。

A・B・C行きの編成を一つの列車へ追加できるが、分割・併合の実行とダイヤはまだ実装していない。

## 操作命令

`executeFleetCommand`は次の命令を扱う。

- `operator-class.create`
- `vehicle-unit.create`
- `formation.create`
- `formation.vehicle.add`
- `train.create`
- `train.formation.add`

現在はUIとルート`MapState`への統合を行っていない。
