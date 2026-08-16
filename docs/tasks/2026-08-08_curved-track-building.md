---
md_class: history
id: task-curved-track-building
type: task
created: 2026-08-08
status: done
owners:
  - codex
relations:
  - design-curved-track-building
  - task-free-map-track-building
epic: epic-phase-minus-one
---

# Task: 曲線線路の敷設

## 目的・背景

折れ線だけでなく、指定した点を滑らかに通る曲線線路を自由マップ上へ敷設できるようにする。

## 責任範囲

- 直線と曲線の敷設方式選択
- 曲線の生成とCanvas描画
- 曲線に沿った選択判定
- 曲線形状の自動テスト

## 対象外

- 鉄道工学上の最小曲線半径
- クロソイド緩和曲線
- 曲率に応じた速度制限と建設費
- 制御点の敷設後編集

## 完了条件

- [ ] 直線と曲線を切り替えて敷設できる
- [x] 曲線が指定点を滑らかに通過する
- [x] 曲線の見た目に沿って選択・撤去できる
- [x] 自動テストと本番ビルドが成功する

## 関連文書

- [Phase -1 Epic](../epics/phase-minus-one.md)
- [Design](../designs/curved-track-building.md)
- [基礎となる線路敷設Task](2026-08-08_free-map-track-building.md)

## 検証方法

- 曲線サンプリングの単体テスト
- `npm run test`
- `npm run build`
- ブラウザで直線と曲線を敷設・選択する

## 作業結果

- 線路データへ`straight`と`curve`の形状種別を追加した。
- Catmull–Romスプラインの共通サンプリング処理を実装した。
- 描画、敷設中プレビュー、選択判定で同じ曲線サンプルを使用した。
- 左側ツールへ直線・曲線の切り替えを追加した。

## 検証結果

- `npm run test`: 6件成功
- `npm run build`: 成功
- 曲線の始点、中間制御点、終点通過を自動テストで確認
- ブラウザ操作: 人間確認待ち

## 未確認事項・残作業

- 実ブラウザで直線と曲線の切り替え、プレビュー、選択感度を確認する。
- 制御点が少ない場合や鋭角な点配置での操作感を確認する。

## 引き継ぎ

起動中の画面を再読み込みし、左側の「曲線」を選ぶ。地図へ3点以上を置き、`Enter`で確定する。
