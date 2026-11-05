---
md_class: operation
id: design-turnout-model
type: design
created: 2026-11-05
status: draft
epic: epic-phase-minus-one
task: task-introduce-turnout-entity
relations:
  - design-track-junction-topology
  - research-osm-railway-import-feasibility
---

# Design: 転てつ器モデル

## 背景

現行モデルに転てつ器の実体はない。分岐は「3本の線路が1つの`TrackJunction`で
出会っている」という暗黙の状態でしかなく、分岐側の線形はプレイヤーが与えた
ジオメトリ任せである。この欠落は複数の設計文書が繰り返し先送りしてきた。

- `design-track-junction-topology`: 分岐器の物理形状と番数はまだ持たない
- `design-individual-track-connections`: 分岐器形状はまだ生成しない
- `design-circular-arc-track-building`: 分岐器固有の線形は対象外

`research-osm-railway-import-feasibility` の測定で、この欠落が外部データ取り込みの
唯一の障害であることが判明した。OSMの転てつ器は分岐側が中央値7.0度で離れるため、
接線検査（許容5度）で73%が拒否される。

## 決定

転てつ器を一級の実体 `Turnout` として導入し、**分岐側の線形を検査対象ではなく
生成物に変える**。

```text
今:  任意の2線路を角度つきで接続しようとする → 接線検査で拒否する
後:  線路上へ番数を指定して転てつ器を置く   → 接線連続な分岐線形を生成する
```

接線連続性の制約は緩めない。制約を満たす形を作る責任をモデル側へ移すだけである。
許容角を広げる案は、全マップの保証を恒久的に下げて一時的なデータ品質問題を
回避する取引になるため採用しない。

## データ形式

### 転てつ器カタログ

`data/track/turnouts.yaml` を追加し、既存の軌間・レール断面と同じ
カタログ形式（`formatVersion`, `catalog`, `items`）に従う。

| 項目 | 内容 |
|---|---|
| `id` | 永続的な機械識別子 |
| `name` | 表示名 |
| `frogNumber` | 番数。分岐角 θ は tan θ = 1/N で定める |
| `divergingRadiusM` | 分岐側の曲線半径 |
| `divergingSpeedKmh` | 分岐側の制限速度 |
| `description` / `sources` | 説明と根拠資料 |

番数が大きいほど分岐側を高速で通過できるが、全長と用地と価格が増える。
この非対称が規格選択のトレードオフになる。

### ゲーム状態

`MapState` へ `turnouts: Turnout[]` と `nextTurnoutId` を追加し、
保存形式を version 12 とする。

```text
Turnout
  ├─ id
  ├─ junctionId        分岐点。接続の正本は既存の TrackJunction のまま
  ├─ typeId            転てつ器カタログへの参照
  ├─ throughTrackId    直進側（基準線）
  ├─ divergingTrackId  分岐側
  └─ side              left | right
```

`TrackJunction` は変更しない。接続点は端点接続・合流・交差も表すため、
すべての接続点が転てつ器であるとは限らない。`Turnout` を別実体として
接続点を参照させることで、既存のトポロジー判定と保存移行へ影響を出さない。

## 分岐側線形の生成

基準線上の分岐位置における接線を起点とし、カタログの半径 R で
中心角 θ = arctan(1/N) だけ曲げる。終点から先は角度 θ の直線として延長する。

```text
          基準線（直進側）
  ────────●───────────────────────────
          │╲
          │ ╲ 半径 R の円弧（中心角 θ）
          │  ╲____________ θ の直線（分岐側）
       分岐点
```

分岐点における分岐側の接線は基準線の接線と一致するため、
生成結果は定義上かならず接線連続になる。

例（12番、R=350 m）: θ = 4.76度、円弧の縦距 29.0 m、横距 1.21 m。

## 公開インターフェース

```text
turnout.create
  trackId            基準線
  position           分岐位置（線路上の点。端点でも途中でもよい）
  typeId             転てつ器カタログのID
  side               left | right
  divergingLengthM?  分岐側の延長（既定は円弧の先に一定長）

turnout.delete
  turnoutId
```

`turnout.create` は分岐側線路を新規に生成し、基準線との接続点を作り、
`Turnout` を記録する。既存線路を分岐側として指定する形は設けない。

OSM取り込みでは次の対応になる。分岐側の線形はカタログから生成されるため、
OSMの粗い7度はエラーではなく「どちら側へ、どの程度の鋭さで分岐するか」の
入力として使われる。

| OSMから読めるもの | 用途 |
|---|---|
| 共有ノードの位置 | `position` |
| 分岐方向の外積の符号 | `side` |
| デジタイズされた発散角 | `typeId` の推定 |

生成した分岐側線路の終端へ、OSMの残りのポリラインを接続する。

## 対象外

次は本設計に含めない。必要になった時点で別途設計する。

- 経路探索・列車移動での分岐側制限速度の反映
- 転換時間、電動・手動の別、信号連動、コスト、保守
- 分岐器の専用描画
- 既存セーブの3分岐接続点からの `Turnout` 自動推定
- OSM取り込み処理そのもの

## 保存移行

version 11 からは `turnouts: []` と `nextTurnoutId: 1` を補うだけの加算的移行とする。
既存の接続点はそのまま残り、転てつ器としては記録されない。
暗黙の分岐が `Turnout` を持たない状態を正常とみなす。
