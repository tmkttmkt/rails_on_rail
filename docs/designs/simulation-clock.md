---
md_class: history
id: design-simulation-clock
type: design
created: 2026-08-11
status: accepted
epic: epic-phase-minus-one
---

# Design: ゲーム内時間

## 決定

- ゲーム内時刻はUI状態ではなく`MapState.clock`へ保存する。
- 時刻は環境のタイムゾーンに依存しないUnixミリ秒で保持し、画面ではUTCとして表示する。
- Phase -1の開始日時は`1900-01-01 06:00:00 UTC`とする。
- 時計は一時停止状態と速度倍率を持つ。速度倍率は`1`、`60`、`300`、`1800`に限定する。
- `simulation.tick`の`elapsedSeconds`はゲーム内経過秒とし、時計と列車を同じ命令で進める。
- ブラウザは描画フレームの実経過時間へ速度倍率を掛け、`simulation.tick`へ変換する。
- AI、UI、テストは同じ時間進行命令を使用する。

## 保存形式

```ts
interface SimulationClock {
  currentTimeMs: number;
  paused: boolean;
  speedMultiplier: 1 | 60 | 300 | 1800;
}
```

時計追加に伴い`MapState`をversion 8とする。version 1〜7は開始日時、一時停止、1倍速を補ってversion 8へ一方向に移行する。

## 対象外

- 暦法、タイムゾーン、夏時間
- 季節、昼夜による描画変化
- 年代による技術・車両・制度の解禁
- 需要、会計、保守周期
- ダイヤと定刻

