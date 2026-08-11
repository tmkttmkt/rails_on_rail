---
md_class: history
id: design-curved-track-building
type: design
created: 2026-08-08
status: superseded
epic: epic-phase-minus-one
task: task-curved-track-building
---

# Design: 曲線線路の敷設

> Catmull–Rom方式は[円弧チェーンによる曲線敷設](circular-arc-track-building.md)へ置き換えられた。本書は初期方式の判断履歴として残す。

## 方式

線路に`geometry: straight | curve`を持たせる。曲線はCatmull–Romスプラインを使い、ユーザーが置いた制御点を通過する滑らかな線として扱う。

Catmull–Romを選ぶ理由は、ベジェ曲線のようなハンドル操作なしで、既存の「点を順に置く」操作を保てるためである。

## サンプリング

隣接する4点から各区間を補間する。端点では最初と最後の点を複製し、線路が指定した始点と終点へ到達するようにする。

描画と選択判定は同じサンプリング結果を使う。これにより、画面上の曲線とクリック判定のずれを防ぐ。

## UI

線路敷設ツールの下に「直線」「曲線」の切り替えを置く。曲線モードでは、敷設中のプレビューも同じスプラインで描画する。

## 将来

曲線半径や緩和曲線を導入する際は、ユーザー入力の制御点と、工学的に生成された線形を分離する。
