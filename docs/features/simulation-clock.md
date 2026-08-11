---
md_class: status
id: feature-simulation-clock
type: feature
updated: 2026-08-11
epic: epic-phase-minus-one
task: task-simulation-clock
---

# Feature: ゲーム内時間

## 現在の機能

- 新規ゲームは1900年1月1日06:00 UTCから一時停止状態で開始する。
- 上部へ年月日と時分秒を表示する。
- 再生・一時停止と、1倍、60倍、300倍、1800倍の時間速度を選択できる。
- `Space`で再生と一時停止を切り替えられる。
- 時間進行は`simulation.tick`命令で時計と運行列車を同時に進める。
- ゲーム内日時、一時停止、速度倍率は`MapState`へ保存される。
- `map.clear`は線路・駅・運行を消去するが時計は維持する。
- version 1〜7の旧セーブには初期時計を補い、version 8へ移行する。

## 現在の制約

- UTC固定で、タイムゾーンと夏時間は扱わない。
- ブラウザがバックグラウンドにある時間は進めない。
- 暦はJavaScriptのグレゴリオ暦表現を使用する。
- 日時は技術解禁、需要、会計、季節、昼夜、ダイヤへまだ影響しない。
- 時間速度は列車の簡易等速運転へだけ反映される。

## 実装

- [状態](../../src/simulation/model.ts)
- [操作命令](../../src/simulation/commands.ts)
- [保存移行](../../src/simulation/persistence.ts)
- [UI](../../src/main.ts)
- [テスト](../../tests/clock.test.ts)

