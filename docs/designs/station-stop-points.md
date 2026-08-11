---
md_class: history
id: design-station-stop-points
type: design
created: 2026-08-09
status: review
epic: epic-phase-minus-one
task: task-station-stop-point-prototype
---

# Design: 駅と線路上の停車地点

## 決定

駅は線路そのものへ埋め込まず、独立した施設として保持する。駅は一つ以上の停車地点を持ち、停車地点が物理線路上の位置を参照する。

```text
Station
  ├─ id
  ├─ name
  ├─ position
  └─ stopPoints[]
       ├─ trackId
       ├─ startDistanceM
       ├─ endDistanceM
       ├─ startPosition
       ├─ endPosition
       └─ direction: both
```

最初のUIではクリックした一本だけに停車地点を作る。線路上の二点を順に指定し、その開始・終了位置を正本として駅範囲を保持する。駅長は終了距離と開始距離の差から導出する。既存駅の延長では、同じ線路上の新しい位置を指定し、現在範囲との和集合へ広げる。将来は同じ駅へ別線の停車地点を追加し、複線駅、複数ホーム、駅構内を表現できるようにする。

線路を撤去して停車地点が一つも残らなくなった駅は削除する。
