---
md_class: history
id: design-one-shot-scheduled-dispatch
type: design
created: 2026-08-13
status: accepted
epic: epic-phase-minus-one
task: task-integrate-purchasable-fleet-and-scheduled-dispatch
relations:
  - design-fleet-state-integration
  - design-route-and-train-movement
  - design-station-track-vehicle-placement
---

# Design: 配置編成の即時発車と一回限り時刻指定発車

## 目的

駅停車線へ配置した編成に既存の運行経路を設定し、即時またはゲーム内絶対日時に一度だけ発車させる。反復ダイヤを簡易予約の繰返しとして実装せず、将来のダイヤモデルと分離する。

## 予約モデル

```ts
type DispatchReservationStatus = "pending" | "executed" | "cancelled" | "failed";

interface DispatchReservation {
  id: string;
  formationId: string;
  placementId: string;
  routeId: string;
  departureTimeMs: number;
  dwellSeconds: number;
  requestedSpeedKph: number;
  status: DispatchReservationStatus;
  createdAtGameTimeMs: number;
  executedAtGameTimeMs?: number;
  failureReason?: string;
}
```

## 暫定運転速度

発車・予約ごとに`requestedSpeedKph`を直接入力し、今回の運行中は全走行区間で一定速度として扱う。

- 0より大きい有限値を要求する。
- 現行UIと整合させ、暫定上限は500 km/hとする。
- 車両設計、編成重量、線路設計速度、曲線半径、勾配、加速、制動による制限は適用しない。
- 駅到着時は既存試作と同様に離散的に停止状態へ移る。
- UIには「テスト用一定速度」であることを表示し、車両性能値と誤認させない。

将来性能計算を導入した際は、この値を目標または希望速度として残し、実速度を別に計算できる。保存形式では単に`speedKph`と呼ばず、`requestedSpeedKph`と命名する。

予約は履歴を残すため、実行・取消後も配列へ保持してよい。ただし保存肥大化が問題になるまでは最適化しない。状態導出で編成を`reserved`と扱うのは`pending`だけである。

## 即時発車

UIの「今すぐ発車」は`departureTimeMs = state.clock.currentTimeMs`として予約命令を発行する。予約生成と発車検査は同じ`executeCommand`内で原子的に実行しても、次tickで実行してもよいが、UI操作後に時間再生を押さなくても発車状態へ移る必要がある。

採用: 予約作成共通処理の後、`departureTimeMs <= currentTimeMs`なら同じ命令内で実行する。これにより一時停止中でも即時発車する。

## 時刻指定発車

- 日時はゲーム内時計の絶対ミリ秒へ変換する。
- UIは年月日と時分を表示し、秒は00を既定とする。
- 現在時刻より後だけを受理する。
- タイムゾーンはゲーム内時計と同じUTCベースの表示規則を使い、端末ローカル時刻へ変換しない。
- 現在時刻と同値は即時扱いとする。
- `Number.isSafeInteger`とゲーム時計の許容範囲を検証する。

## 発車前検証

予約作成時と実行時の両方で検証する。予約後に状態が変わる可能性があるため、作成時だけでは不十分である。

- 編成が存在し空でない
- 編成が指定placementへ配置されている
- 他のpending予約と運行列車が同編成を参照していない
- 経路が存在する
- 配置駅が経路の最初のstationIdと一致する
- 経路の最初のlegが配置trackから到達可能
- dwellSecondsが有限で0以上
- requestedSpeedKphが0より大きく500以下の有限値

配置駅が経路途中駅である場合、今回そこからの部分運転は行わず拒否する。将来は運行区間指定として別設計する。

## tick処理

simulation tickで時間を進める前後の扱いを固定する。

```text
previousTime < departureTime <= nextTime
```

を満たすpending予約を、`departureTimeMs`、次に予約ID順で実行する。同一tickに複数予約がある場合も決定的な順序になる。

大きなtickが複数の予約時刻を跨いでも各予約を一回だけ実行する。時刻を進めたあとにまとめて列車へ経過時間全量を適用すると早く進みすぎるため、tick区間を予約時刻で分割する。

```text
前回時刻
  → 予約Aまで既存列車を進める
  → Aを発車
  → 予約Bまで全列車を進める
  → Bを発車
  → tick終端まで全列車を進める
```

既存の最大60秒刻みと併用し、予約境界と60秒境界の早い方で分割する。

## 発車処理

1. 実行時検証
2. `OperatingTrain` ID採番
3. `formationId`を実在編成IDとして設定
4. `requestedSpeedKph`を既存運行列車の一定速度へ渡す
5. 配置地点と始発stop pointの整合から初期経路距離を決定
6. 配置を削除
7. 予約を`executed`へ変更
8. 列車を運行状態へ追加

途中で例外が起きた場合に配置だけ消えないよう、複製状態上で原子的に行う。

## 予約失敗

実行時に条件を満たさない場合:

- `status = failed`
- `failureReason`へ安定した機械可読コードと表示用メッセージを持たせることを推奨
- 配置は維持
- 運行列車は作らない
- 同じ予約を次tickで再試行しない

候補コード:

- `formation-missing`
- `formation-empty`
- `placement-missing`
- `route-missing`
- `start-station-mismatch`
- `formation-already-operating`

一時的な占有だけを理由に自動再試行する仕組みは今回持たない。

## 取消

- pendingだけ取消可能。
- 取消後も配置は維持。
- executedは列車取消ではないため取消不可。
- failedは履歴削除ではなく、新しい予約を作る。

## 終着

既存`OperatingTrain.state = completed`になった時点で、編成を終着駅へ返す処理を一度だけ行う。

- 空き位置へ配置成功: 運行列車は完了履歴として保持してよいが、編成のoperating導出対象から除外する。
- 配置失敗: 完了列車に`awaitingPlacement = true`相当を持たせ、編成は運行占有のままとする。

同じ完了列車から毎tick配置を増殖させないため、回収済みフラグまたは配置存在で冪等にする。

## UI表示

- 現在のゲーム内日時を入力欄の近くへ表示。
- 即時と日時指定をradioまたは明確な二操作にする。
- pending予約は編成一覧と運行画面の双方へ表示。
- 発車までの残り時間を導出表示してよい。
- failedは赤、ブレーキ警告は黄として区別する。

## AI操作

AIは`departureTimeMs`を直接指定できる。人間向け日時文字列の解釈をシミュレーション命令へ持ち込まない。状態取得時に現在時刻と予約一覧を構造化して返す。

## 検証

- 一時停止中の即時発車
- 未来時刻直前、同値、直後
- 60秒以上のtickで予約境界を跨ぐ
- 同時刻複数予約の決定順序
- 予約取消
- 予約後の経路削除などによるfailed
- 保存・復元後の一回だけ実行
- 終着時の自動配置成功・失敗

## 将来のダイヤとの境界

反復ダイヤは`DispatchReservation`を大量生成する機能として実装しない。将来のService/Timetableが運転日ごとに一回限り予約または運行インスタンスを生成する構造とする。
