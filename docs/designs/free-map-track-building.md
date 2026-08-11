---
md_class: history
id: design-free-map-track-building
type: design
created: 2026-08-08
status: active
epic: epic-phase-minus-one
task: task-free-map-track-building
---

# Design: 自由マップ線路敷設

## 目的

画面座標とは独立したワールド座標へ線路を保持し、カメラを自由に動かして編集できる基礎を作る。

## 状態

- `MapState`: 保存形式バージョン、線路、次ID
- `Track`: ID、2点以上のワールド座標列
- `Camera`: 画面中心に対応するワールド座標、ズーム倍率

カメラはUI状態とし、線路データには含めない。

## 座標変換

画面中央をカメラ中心とし、次の相互変換を行う。

```text
screen = (world - camera) × zoom + viewportCenter
world  = (screen - viewportCenter) ÷ zoom + camera
```

ズーム時はポインター下のワールド座標を固定し、対象位置が飛ばないようカメラを補正する。

## 線路敷設

線路ツールでクリックしたワールド座標を一時点列へ追加する。2点以上で確定可能とし、折れ線として1つの線路を作成する。

- クリック: 点を追加
- `Enter`または確定ボタン: 線路を確定
- `Backspace`: 最後の点を戻す
- `Escape`: 敷設中の線路を取り消す

## 選択と撤去

画面上のクリック位置から各線分までの距離を計算し、一定ピクセル以内で最も近い線路を選択する。削除キーまたは撤去ボタンで状態から除去する。

## 描画

Canvas上へズーム段階に応じたグリッド、原点、既設線路、敷設中線路を描く。外部地図ライブラリは使用しない。
