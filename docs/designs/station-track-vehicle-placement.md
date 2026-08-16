---
md_class: history
id: design-station-track-vehicle-placement
type: design
created: 2026-08-13
status: accepted
epic: epic-phase-minus-one
task: task-integrate-purchasable-fleet-and-scheduled-dispatch
relations:
  - design-fleet-state-integration
  - design-station-stop-points
---

# Design: カーソル指定による駅停車線への編成配置

## 目的

未配置編成を、駅名だけで自動配置せず、ユーザーが地図上で指示した駅停車線と位置へ配置する。複数線路を持つ駅でも意図した線路を明確に選べるようにする。

## 配置の正本

```ts
interface VehiclePlacement {
  id: string;
  formationId: string;
  stationId: string;
  trackId: string;
  centerDistanceM: number;
  occupiedStartDistanceM: number;
  occupiedEndDistanceM: number;
  orientation: "forward" | "reversed";
}
```

- `stationId`: 駅所属と運行経路始発判定に使用
- `trackId`: 実際の停車線
- `centerDistanceM`: カーソルが指示した編成基準位置
- 占有開始・終了距離: 重複検査と描画に使用

ワールド座標は線路変更で陳腐化するため保存しない。必要な座標は`sampleTrack`と線路距離から導出する。

## 配置操作

1. 車両画面で未配置かつ非空の編成を選ぶ。
2. 「駅へ配置」を押して配置ツール状態へ入る。
3. 建設編集を一時的に解除し、カーソルを線路へスナップする。
4. スナップ位置を含む駅stop pointを検索する。
5. 有効候補なら編成の占有範囲をプレビューする。
6. 駅停車範囲中央から見たカーソル側に基づいて初期方向を決める。
7. `R`入力ごとにプレビューと保存予定方向を反転する。
8. クリックで`fleet.formation.place`を発行する。
9. 成功後に配置ツールを終了する。失敗時は理由を表示し、ツールを維持する。

Escapeで配置操作を取消し、編成状態は変更しない。

## 配置方向

駅stop pointの距離範囲中央を`stationCenterDistanceM`とする。

- `cursorDistanceM > stationCenterDistanceM`: 線路距離が増える方向を初期`forward`
- `cursorDistanceM < stationCenterDistanceM`: 線路距離が減る方向を初期`forward`
- 中央との差が許容誤差内: 線路距離が増える方向を既定値
- `R`: 上記初期値に対する反転フラグを切り替える

配置プレビューへ編成先頭を示す矢印を表示する。`R`は配置ツール中だけ消費し、入力欄フォーカス中や他モードでは既存操作を妨げない。配置方向は車両順序自体を書き換えず、編成全体が線路上でどちらを向くかとして保存する。

## 駅範囲判定

カーソル点を線路上距離`distanceM`へ変換し、同じ`trackId`を参照する駅stop pointについて次を満たすか判定する。

```text
stopPoint.startDistanceM <= distanceM <= stopPoint.endDistanceM
```

複数駅範囲が重なる不正または特殊状態では、最も短い距離にあるstop pointを自動選択せず候補一覧を表示する。Phase -1で駅重複が禁止されているなら保存検証でも拒否する。

## 暫定編成長

最優先は車両カタログの寸法合計を利用する。既存YAMLに長さがある場合:

```text
formationLengthM = Σ vehicle.lengthM
```

寸法がないdraft車両については一両20mの暫定値を使用し、警告用の`estimatedLength`を導出結果へ含める。保存値として固定せず、カタログ更新時に再計算する。

占有範囲:

```text
start = centerDistanceM - formationLengthM / 2
end   = centerDistanceM + formationLengthM / 2
```

今回、占有範囲が駅stop pointを越えてもホーム有効長制限として拒否しない。ただし同一線路の実在範囲からはみ出す配置は拒否する。UIには「駅範囲を超えるが今回のテストモードでは許可」の警告を出してよい。

## 重複判定

同一`trackId`上の既配置編成と開区間ではなく閉区間として比較する。安全余白は今回0mとし、端が同一点なら重複として拒否する。

```text
newStart <= existingEnd && existingStart <= newEnd
```

運行中列車との衝突、隣接線路との車体干渉は対象外。

## 配置解除

- `placed`状態だけ解除可能。
- 予約済みは先に予約取消が必要。
- 運行中は解除不可。
- 解除後は未配置編成となり、車両編集可能になる。

## 線路・駅編集との整合

配置を参照する駅、線路、stop pointを削除または縮小する操作は拒否する。暗黙に編成を消したり別線へ移したりしない。エラーには配置IDと編成名を含める。

マップ全消去はユーザーが明示した全消去なので、配置・Fleet・予約・運行をまとめて消去する。

## 描画

- 線路上の占有区間を編成色で太く表示する。
- 中央に編成名または短縮IDを表示する。
- 配置プレビューは半透明、確定配置は不透明とする。
- 予約済みは時計アイコンまたは色で区別する。
- 地図縮小時は車両一両ずつではなく編成単位の記号へ簡略化する。

## 発車・終着との関係

発車時、配置を削除して`OperatingTrain`へ位置を引き渡す。経路の始端は配置駅の候補stop pointから始まる経路でなければならない。

終着時は経路が選んだ終着stop pointの中央へ配置する。重複する場合:

- 運行列車を消さない。
- 状態を`completed-awaiting-placement`として保持するか、既存`completed`列車と編成参照を保持する。
- UIへ「終着したが配置場所がない」と警告する。
- 自動的に他線へワープさせない。

採用: `OperatingTrain`に完了状態のまま編成参照を残し、ユーザーが空き位置を指定して回収する後続操作を用意する。空き位置がある場合だけ自動配置して運行列車から編成占有を解放する。

## 検証

- 直線・曲線双方のカーソル距離変換
- 駅中央の両側で初期方向が反転し、`R`で再反転すること
- 駅範囲の開始、中央、終了、範囲外
- 同一駅の複数線路選択
- 配置重複、端接触、異なる線路
- 保存・復元後の同一点描画
- 発車時の配置解除と終着時の復帰
