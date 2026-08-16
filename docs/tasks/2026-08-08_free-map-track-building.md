---
md_class: history
id: task-free-map-track-building
type: task
created: 2026-08-08
status: done
owners:
  - codex
relations:
  - design-free-map-track-building
  - task-first-interactive-prototype
epic: epic-phase-minus-one
---

# Task: 自由マップ線路敷設プロトタイプ

## 目的・背景

駅や列車より先に、自由な平面を移動・拡大縮小し、その上へ任意形状の線路を敷設できる基礎操作を成立させる。

## 責任範囲

- 無限平面として扱える2Dマップ
- パンとズーム
- 任意の複数点を結ぶ線路敷設
- 敷設中の取り消しと確定
- 線路の選択と撤去
- 線路状態と座標変換の自動テスト

## 対象外

- 駅、列車、経路探索、運行
- 現実の地理情報と地図タイル
- 曲線補間、分岐器、複線、規格
- 保存と読み込み

## 完了条件

- [ ] マップをドラッグ移動・ホイール拡大縮小できる
- [ ] 任意の位置を連続選択して線路を敷設できる
- [ ] 敷設途中の点を戻し、作業を取消・確定できる
- [ ] 既設線路を選択して撤去できる
- [x] 座標変換と線路操作の自動テストが成功する
- [x] 本番ビルドが成功する

## 関連文書

- [Phase -1 Epic](../epics/phase-minus-one.md)
- [Design](../designs/free-map-track-building.md)

## 検証方法

- `npm run test`
- `npm run build`
- ブラウザでパン、ズーム、敷設、撤去を操作する

## 作業結果

- 駅、列車、経路探索を現行実装から外した。
- ワールド座標、カメラ、相互座標変換を実装した。
- 自由な点列による線路作成と撤去の共通操作命令を実装した。
- Canvas上のパン、ズーム、線路敷設、選択、撤去UIを実装した。
- [現在仕様](../features/free-map-track-building.md)を作成した。

## 検証結果

- `npm run test`: 4件成功
- `npm run build`: 成功
- ブラウザ操作: 人間確認待ち

## 未確認事項・残作業

- 実ブラウザでパン、ズーム、線路敷設、取り消し、撤去を確認する。
- 折れ線の操作感を確認し、曲線敷設へ進む前の基礎として適切か判断する。

## 引き継ぎ

`npm run dev`で起動する。線路ツールで複数点をクリックして`Enter`、移動ツールでドラッグ、ホイールでズーム、選択ツールと`Delete`で撤去を確認する。
