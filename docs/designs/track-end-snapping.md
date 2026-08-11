---
md_class: history
id: design-track-end-snapping
type: design
created: 2026-08-08
status: superseded
epic: epic-phase-minus-one
task: task-track-end-snapping
---

# Design: 敷設中線路の終点吸着

> Catmull–Romを前提とする終端処理は[円弧チェーンによる曲線敷設](circular-arc-track-building.md)と[線路接続構造と現行文書の安定化](../tasks/2026-08-09_stabilize-track-topology-and-docs.md)へ置き換えられた。

## 操作

始点を置いた後もポインターと既設線路の最近点を計算する。許容距離内ではプレビュー終点を吸着位置へ置き、クリック時に線路を自動確定する。

## 終端接線

吸着先の描画線分から接線を取得し、曲線の最終区間の微分方向へ使用する。接線の符号は直前の制御点から終点へ向かう方向に合わせる。

Catmull–Romの終端に仮想制御点を置き、終点微分が接続先接線と一致するようにする。描画と選択判定は同じサンプル列を使用する。

## 制約

接続は座標と接線の一致までを扱う。ネットワークとしての接続関係は、線路グラフ導入時に既設線路を交点で分割して表現する。
