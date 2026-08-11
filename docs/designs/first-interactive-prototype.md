---
md_class: history
id: design-first-interactive-prototype
type: design
created: 2026-08-08
status: superseded
epic: epic-phase-minus-one
task: task-first-interactive-prototype
---

# Design: 最初の操作可能な鉄道プロトタイプ

この設計は[自由マップ線路敷設](free-map-track-building.md)に置き換えられた。

## 目的

表示技術から独立したゲーム状態と操作命令を作り、その状態をCanvas UIから操作・描画する。

## 構成

```text
Canvas・DOMイベント
        ↓ GameCommand
command reducer
        ↓
    GameState ← tick
        ↓
   Canvas renderer
```

## 状態モデル

- `Station`: ID、名前、平面座標
- `Track`: ID、接続する2駅
- `Train`: ID、現在区間、経路、進行率、運行状態
- `GameState`: バージョン、時刻、速度、駅、線路、列車

状態はJSONへ直列化できる値だけで構成する。

## 操作命令

- 駅を作る
- 線路を作る
- 列車を駅へ配置する
- 列車の目的地を設定する
- シミュレーション速度を変更する
- 状態を置換する

UIと将来のAI入力は同じ命令処理関数を利用する。

## 経路探索と移動

線路を無向グラフとして扱い、幅優先探索で最少区間経路を求める。列車は一定のワールド距離速度で線路上を進み、区間終端で次区間へ移る。

## UI

Canvasを地図として使い、ツールバーで操作モードを切り替える。初回でも触り方が分かるよう、現在モード、次の操作、選択状態を表示する。デモ網を一度に作る操作も用意する。

## 保存

ブラウザの`localStorage`へゲーム状態をJSON保存する。読み込み時は最低限の構造を検証し、保存形式のバージョンを保持する。

## 検証

- 操作命令による状態更新
- 複数区間の経路探索
- tickによる列車到着
- JSON往復
- Viteによる本番ビルド
