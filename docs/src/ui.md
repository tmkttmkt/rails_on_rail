---
md_class: status
id: doc-src-ui
type: reference
updated: 2026-08-11
---

# src/ui — UIモジュール

Canvas描画とユーザー操作を担当する層。simulation/ への依存は許可するが、逆方向の依存は禁止。

---

## ui/renderer.ts — Canvas描画

```ts
interface RenderState {
  draftPoints: Point[];               // 敷設中の確定済み点列
  pointerWorld: Point | null;         // ポインターのワールド座標（プレビュー用）
  selectedTrackIds: string[];         // 選択中の線路ID
  draftGeometry: TrackGeometry;       // 敷設中の形状種別
  snapPoint: Point | null;            // スナップ候補点（既設端点への吸着）
}
```

`drawMap(context, state, camera, renderState): void`

Canvasへ以下の順で描画する。

1. 背景塗りつぶし（`#d9dde0`）
2. グリッド（ズーム段階に応じて間隔を切り替え）
3. 既設線路（選択中は強調色）
4. 敷設中プレビュー（draftPoints + pointerWorld の折れ線/曲線）
5. 敷設中の確定済み点のマーカー（青）
6. スナップ候補点のリング（緑）
7. 原点マーカー

線路の描画は `geometry.sampleTrack()` でサンプリングした点列を polyline で描く。

---

## main.ts — UI状態管理と入力処理

### ツール

```ts
type Tool = "track" | "station" | "select" | "pan"
```

| ツール | 操作 |
|---|---|
| `track` | クリックで点を追加。Enter確定、Backspace戻し、Escape取消 |
| `station` | 線路上をクリックし、駅名を入力して停車地点を作る |
| `select` | クリックで駅または線路を選択。Shift＋クリックで線路を複数選択し、束の作成・追加・除外・解体を行う。Delete撤去 |
| `pan` | ドラッグでカメラ移動 |

中ボタン・右ボタンドラッグは全ツールでパンとして機能する。

### 状態変数

| 変数 | 型 | 説明 |
|---|---|---|
| `state` | `MapState` | 現在のゲーム状態（immutable、コマンド適用で差し替え） |
| `camera` | `Camera` | カメラ位置とズーム |
| `tool` | `Tool` | 現在のツール |
| `draftGeometry` | `TrackGeometry` | 敷設中の形状種別 |
| `draftPoints` | `Point[]` | 敷設中の確定済み点列 |
| `pointerWorld` | `Point \| null` | マウス位置のワールド座標 |
| `snapPoint` | `Point \| null` | スナップ先の既設端点 |

ゲーム内日時はUI状態ではなく`MapState.clock`を表示する。描画フレームの実経過時間を10 Hzで集約し、選択中の速度倍率を掛けたゲーム内秒として`simulation.tick`へ渡す。バックグラウンド中の経過時間は補完しない。

### コマンド発行

ユーザー操作は `executeCommand(state, command)` を呼んで状態を更新する。
結果は `state` に差し替え、メッセージを toast で表示し、Canvasを再描画する。

---

## 依存関係

```
src/
  simulation/
    model.ts      ← ui/renderer.ts, main.ts
    commands.ts   ← main.ts
    geometry.ts   ← ui/renderer.ts, main.ts
    specs.ts      ← (Phase 1以降)
  ui/
    renderer.ts   ← main.ts
    style.css     ← main.ts
  main.ts         エントリーポイント
```
