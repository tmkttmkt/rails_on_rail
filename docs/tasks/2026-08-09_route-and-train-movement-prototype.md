---
md_class: history
id: task-route-and-train-movement-prototype
type: task
status: done
created: 2026-08-09
epic: epic-phase-minus-one
design: design-route-and-train-movement
---

# Task: 駅間経路探索と列車移動を試作

## 目的

駅・接続点・既存の編成概念を接続し、複数停車駅を通る運行経路を作成して列車が地図上を移動するPhase -1の縦断試作を完成させる。

## 責任範囲

- 接続点と線路内距離による駅間最短経路探索
- 複数停車駅を順に結ぶ運行経路
- 編成IDを参照する運行列車
- 時間経過による走行、途中駅停車、終着
- 経路・列車の地図表示、作成UI、保存

## 対象外

- 信号、閉塞、列車競合、ダイヤ
- 車両性能からの加減速、分割併合
- 編成編集UIと本格的な運行管理画面

## 完了条件

- [x] 接続された二駅間の経路を探索できる
- [x] 三駅以上を順に結ぶ運行経路を作れる
- [x] 編成IDを持つ列車が経路上を走り、駅で停車する
- [x] 経路・列車を保存・復元できる
- [x] 自動テストと本番ビルドが成功する

## 作業結果

- 接続点と駅中心を線路内距離グラフへ変換する最短経路探索を実装した。
- 選択順の停車駅から運行経路を作り、編成IDと速度を持つ列車を配置できるUIを追加した。
- 始発・途中駅停車、走行、終着と地図描画を実装した。
- ゲーム状態をversion 7へ更新し、旧version 1〜6を移行可能にした。
- [現在仕様](../features/routes-and-train-movement.md)を追加した。

## 検証結果

- `npm run test`: 7ファイル、88件成功
- `npm run build`: 成功
- `git diff --check`: エラーなし
- ブラウザ操作: 人間確認待ち

## 検証

- `npm run test`
- `npm run build`
- `git diff --check`
- 人間確認: 経路作成、発車、途中停車、終着の視認性と操作感
