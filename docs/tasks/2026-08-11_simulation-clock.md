---
md_class: history
id: task-simulation-clock
type: task
created: 2026-08-11
status: done
owners:
  - codex
relations:
  - design-simulation-clock
  - task-route-and-train-movement-prototype
  - feature-map-save-and-load
epic: epic-phase-minus-one
---

# Task: ゲーム内時間を実装する

## 目的・背景

列車移動で局所的に使っている経過秒を、保存可能なゲーム全体の日時へ発展させる。人間とAIが同じ命令で時間を進め、一時停止と速度変更を行えるPhase -1の基盤を作る。

## 責任範囲

- 保存されるゲーム内日時、一時停止、速度倍率
- 時計と列車を同時に進める操作命令
- 一時停止と速度変更UI
- 旧セーブ移行
- 自動テストと現在仕様文書

## 対象外

- 技術年代、需要、会計、季節、昼夜
- ダイヤと定刻運行
- バックグラウンド中の時間進行

## 完了条件

- [x] ゲーム内日時を画面へ表示できる
- [x] 一時停止と4段階の速度変更ができる
- [x] 時間進行で時計と運行列車が同時に進む
- [x] 時計を保存・復元できる
- [x] version 1〜7セーブをversion 8へ移行できる
- [x] テストと本番ビルドが成功する

## 実装結果

- `MapState.clock`へUTC日時、一時停止、時間速度を追加し、状態versionを8へ更新した。
- `simulation.tick`で時計と列車を同時に進め、停止・速度変更命令を追加した。
- 上部へ日時、再生・停止、1倍・60倍・300倍・1800倍の操作を追加した。
- UIの実経過時間を10 Hzでゲーム内時間へ変換し、バックグラウンド時間を進めないようにした。
- version 1〜7の移行処理と不正時計の検証を追加した。

## 検証結果

- `npm run test`: 17ファイル、202件成功（`.claude/worktrees/`配下の複製テストを含む）
- `npm run build`: 成功
- 蒸気機関車運用試験線をversion 8で再生成し、5経路の走破確認に成功
- 開発サーバーAPIから同マップの時計を取得し、1900年1月1日06:00、一時停止、1倍速を確認
- ブラウザ操作: 利用可能なブラウザがないため人間確認待ち

## 未確認事項・残作業

- 上部の時計表示、Space、速度ボタン、セーブ復元をブラウザで確認する。
- 日時を技術、需要、会計、季節、昼夜、ダイヤへ接続する作業は後続Phaseへ分離する。

## 関連文書

- [ゲーム内時間](../designs/simulation-clock.md)
- [simulationモジュール](../src/simulation.md)
