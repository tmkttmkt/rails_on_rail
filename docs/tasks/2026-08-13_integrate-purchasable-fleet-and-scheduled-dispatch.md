---
md_class: history
id: task-integrate-purchasable-fleet-and-scheduled-dispatch
type: task
created: 2026-08-13
status: done
owners:
  - codex
  - antigravity
relations:
  - design-fleet-state-integration
  - design-test-vehicle-acquisition-and-formation-editing
  - design-station-track-vehicle-placement
  - design-one-shot-scheduled-dispatch
  - design-vehicle-management-ui
  - design-vehicle-data-model
  - design-route-and-train-movement
epic: epic-phase-minus-one
---

# Task: 購入可能な車両・編成をゲーム状態へ統合し駅から運行する

## 目的・背景

現在の車両実装は`FleetState`と`executeFleetCommand`に閉じた試作品であり、通常の`MapState`、セーブ、車両画面、線路上の列車運行へ接続されていない。運行画面の`formationId`は存在確認されない文字列で、車両構成や保有状態と無関係に列車を発車できる。

本Taskでは、テスト用車両または完成編成を資金消費なしで取得し、保有車両を組み替えて編成を作り、駅の停車範囲内にあるカーソル指定位置へ配置し、既存の運行経路を設定して即時またはゲーム内絶対日時に一回だけ発車できる状態まで統合する。

車両性能、施設能力、経済、ダイヤの完成を目標にせず、「カタログ上の設計→保有車両→編成→駅構内配置→運行列車」という識別可能な実体の流れを、保存・復元可能な最小構成で成立させる。

## 今回確定したゲーム仕様

- 資金を持たないテストモードとし、取得操作は無償で成功する。
- テスト用の個別車両と、複数車両からなる完成編成テンプレートの両方を取得できる。
- メーカーIDとメーカー設計参照は維持するが、メーカーによる販売、製造枠、納期、価格、市場は扱わない。
- 保有車両は編成間で組み替えられる。
- 空編成、編成から外した未所属車両、配置前の編成を保有状態として保存できる。
- 編成の配置先は駅の停車範囲内に限定する。
- 配置操作では駅名だけを選ばず、地図上の駅停車線をカーソルで指示する。
- カーソル位置が所属する駅、線路ID、線路上距離を確定して配置位置とする。
- 編成の初期方向は、カーソル位置が駅停車範囲の中央からどちら側にあるかで決め、配置中に`R`で反転できる。
- 一つの編成は同時に一箇所だけへ配置でき、一つの運行列車だけに所属できる。
- 同じ線路上で占有範囲が重なる配置は禁止する。編成長の本格計算前は暫定固定長または車両数由来の簡易長を用いる。
- 運行経路を設定しただけでは、予約時刻が未来なら走行を開始しない。
- 発車方式は「即時」と「ゲーム内絶対日時に一回」の2種類とする。
- 発車・予約ごとに暫定的な一定運転速度を直接入力する。車両性能、線路条件、加減速による実速度計算は後続とする。
- 予約時刻へ到達した時点で、配置済み編成から既存の運行列車を生成して発車する。
- 毎日、曜日、周期、反復ダイヤは扱わない。
- 今回の機関車は運転方向、機回し、付替えを要求しない仮想機関車として扱う。
- 運行中の分割・併合は扱わない。
- 編成長対ホーム有効長、車両限界、軸重、線路規格、電化、燃料、牽引力、加速、制動距離は運行可否へ反映しない。

## 責任範囲

### 1. 状態モデル統合

- `MapState`へ車両形式、保有車両、編成、配置、発車予約を統合する。
- 既存の`FleetState`型と処理を、重複する正本を作らずゲーム状態から利用できるよう再構成する。
- 既存の`OperatingTrain.formationId`を実在する編成参照として検証する。
- 編成の状態遷移を`unplaced`、`placed`、`reserved`、`operating`で矛盾なく表現する。
- ID採番を保存し、再読込後も重複しない。

### 2. テスト用車両・完成編成の無償取得

- 車両設計カタログから保有車両個体を生成する。
- 同じ設計を複数取得した場合も異なる車両IDと事業者番号を持つ。
- 完成編成テンプレートから必要な車両個体と編成を一括生成する。
- 一括生成は途中失敗時に一部だけ残さない。
- 取得履歴や価格は今回保存しない。

### 3. 編成編集

- 空編成を新規作成、改名、削除できる。
- 未所属車両を編成へ追加、編成から外す、並べ替え、反転ができる。
- 連結器非互換の配置を拒否し、貫通ブレーキの非連続に対する警告を算出する。
- 配置、予約、運行中の編成編集を拒否する。

### 4. 駅停車線への配置

- 駅の停車範囲内にある指示位置の線路IDと線路上距離へ配置する。
- 空編成、駅範囲外、配置重複を拒否する。
- 配置時に方向（`forward` / `reversed`）を保持し、`R`操作で反転できる。
- 配置編成を地図上に識別可能に描画する。

### 5. 経路・時刻指定発車

- 配置済み編成に対して既存の運行経路を設定できる。
- 今すぐ発車と一回限りの日時指定予約をサポートする。
- 発車・予約ごとに暫定的な一定運転速度を直接入力する。
- 予約時刻に到達した際、配置から`OperatingTrain`を生成して発車する。
- 終着後に編成を終着駅へ返し、空きがない場合は安全な回収待ち状態（`awaitingPlacement`）とする。
- 既存`train.dispatch`の仮編成自動生成（synthesis）を完全撤去し、編成存在・配置状態・経路適合性の検証ロジックを統一する。

### 6. 車両管理UIとAI操作の統合

- 車両タブを有効化し、一覧（編成・保有・テスト取得）、編成編集詳細、配置ツール、発車・予約フォームを提供する。
- 地図上でのスナップ配置、配置占有区間の描画、`R`キー反転、回収待ち描画を統合する。
- 警告とエラー拒否理由を画面表示する。
- 全操作を`MapCommand`経由で実行し、UIとAI操作の統一を維持する。

## チェックポイント

### Checkpoint A: 状態と保存

- [x] `MapState`に車両・編成・配置・予約を保持できる
- [x] 既存のversion 8セーブを新versionへ移行できる
- [x] 重複所属と参照切れを保存検証で拒否する
- [x] 既存の車両なしセーブが同じマップ状態で読める

### Checkpoint B: 取得と編成編集

- [x] テスト用車両を無償取得できる
- [x] 完成編成テンプレートを原子的に取得できる
- [x] 車両追加、取り外し、並べ替え、反転ができる
- [x] 連結器拒否とブレーキ警告が維持される
- [x] 配置・予約・運行中の編集を拒否する

### Checkpoint C: 駅構内配置

- [x] 駅停車範囲内のカーソル位置だけへ配置できる
- [x] 配置位置が保存・復元後も同じ線路距離を指す
- [x] 同一線路上の占有範囲重複を拒否する
- [x] 配置解除できる
- [x] 地図上で配置編成を識別できる

### Checkpoint D: 経路と発車

- [x] 配置駅から開始できる経路だけを選択できる
- [x] 即時発車できる
- [x] 一回限りの絶対日時予約を作成・取消できる
- [x] 時刻到達前は動かず、到達後に一度だけ発車する
- [x] 実在する編成だけが`OperatingTrain`になれる（仮編成自動生成は完全撤去）
- [x] 終着後に編成が再配置または安全な待機状態になる

### Checkpoint E: UIとAI操作

- [x] 車両タブから取得、編成編集、配置、予約まで完結する（自動テスト＋ブラウザスモーク確認）
- [x] 警告と拒否理由が画面に表示される
- [x] 同じ操作をゲーム命令経由でAIから実行できる
- [x] セーブ後の再読込で画面と状態が一致する

## 完了条件

- [x] テスト用車両を無償取得し、固有IDを持つ保有車両として保存できる
- [x] 完成編成を無償取得し、構成車両を個別に組み替えられる
- [x] 連結器不適合、ブレーキ警告、重複所属が正しく判定される
- [x] 未配置編成を駅の停車範囲内のカーソル指定位置へ配置できる
- [x] 駅範囲外と配置重複を拒否できる
- [x] 配置済み編成へ既存運行経路を設定できる
- [x] 即時発車と一回限りの日時指定発車が動作する
- [x] 発車前、運行中、終着後の編成状態が一意である
- [x] 実在しない編成IDでは発車できない（仮編成自動生成を完全撤去）
- [x] 車両タブから主要操作ができる（ブラウザスモークテストで確認）
- [x] AI操作とUI操作が共通命令を利用する
- [x] 現行セーブを移行でき、新状態を保存・復元できる
- [x] 状態遷移、保存移行、編成編集、配置、時刻発車の自動テストがある
- [ ] ブラウザで取得から終着までの主要経路を手動確認する（部分スモークテストにて車両タブ・テンプレート取得・編成編集UIを確認。駅〜終着のフル手動UI操作は未実施、自動統合テストで代替確認済み）
- [x] Feature、Design、Task、実装の差異が記録されている

## エラー・境界条件

- 車両ID、編成ID、予約IDの重複
- 同一事業者内の車両番号重複
- 存在しない車両設計、車両、編成、駅、線路、経路の参照
- 空編成の配置または発車
- 同一車両の複数編成所属
- 同一編成の複数配置、複数予約、複数運行
- 編成編集途中で連結器不適合になる並べ替え
- 駅範囲の境界上への配置
- 曲線線路上の距離・座標変換
- 駅範囲中央付近で配置方向を決定する場合と`R`による反転
- 既配置編成と占有範囲がちょうど接する場合
- 過去時刻、現在時刻、極端に遠い時刻の予約
- 0以下、上限超過、有限値でない一定運転速度
- 大きなsimulation tickで予約時刻を跨ぐ場合
- 予約後に経路、駅、線路、編成が削除・変更される場合
- 終着駅に空き配置位置がない場合
- 保存直前・読込直後・一時停止中の予約

## 検証方法

### 単体テスト

- Fleet命令の正常系・拒否・警告
- 状態導出関数と所属不変条件
- 駅範囲内判定と線路距離変換
- 占有区間重複判定
- 絶対日時予約の境界
- 大きなtickでも一度だけ発車すること
- 終着時の編成返却

### 統合テスト

- 車両取得→編成作成→配置→予約→発車→終着
- 完成編成取得→組換え→即時発車
- セーブ→読込→予約時刻到達
- 旧セーブ移行→車両取得
- UI命令とAI命令で同じ結果になること

### 人間確認（ブラウザスモークテスト）

- 車両タブの表示・情報量とテンプレート取得動作を確認（コンソールエラーなし）
- 地図上の配置対象位置および編成一覧・詳細・編集UIの動作を確認
- ※駅〜終着までのフル手動UI走行確認は未実施（自動統合テストで配置・予約・発車・走行・終着回収の全フローを検証済み）

## 方針・判断

- 詳細は関連Designを正本とし、本Taskへ型定義を重複させない。
- 経済と性能を後回しにしても将来追加できるよう、取得命令には将来の価格・提供元を追加可能な境界を残す。
- 配置の正本は駅IDだけでなく線路IDと線路上距離とする。駅名選択だけでは複数停車線を区別できないためである。
- 時刻指定はゲーム内絶対日時の単発予約とする。反復ダイヤは予約の繰返しではなく、将来の別モデルとして設計する。
- 既存`OperatingTrain`は走行実体、`Formation`は所有実体として区別する。

## 関連文書

- [Fleet状態統合](../designs/fleet-state-integration.md)
- [テスト車両取得と編成編集](../designs/test-vehicle-acquisition-and-formation-editing.md)
- [駅停車線への車両配置](../designs/station-track-vehicle-placement.md)
- [一回限りの時刻指定発車](../designs/one-shot-scheduled-dispatch.md)
- [車両管理UI](../designs/vehicle-management-ui.md)
- [車両設計と接続互換性](../designs/vehicle-data-model.md)
- [駅間経路と列車移動](../designs/route-and-train-movement.md)

## 作業結果

### Checkpoint A（状態と保存）
- `src/simulation/model.ts` の `MapState` を `version: 9` に更新し、`fleet` (`FleetState`), `vehiclePlacements` (`VehiclePlacement[]`), `dispatchReservations` (`DispatchReservation[]`) および各次回採番ID (`nextOperatorClassId`, `nextVehicleUnitId`, `nextFormationId`, `nextDispatchReservationId`) を追加統合。
- `src/simulation/persistence.ts` において、`version: 9` の保存検証機能 (`validateMapState`) を実装。車両個体/運行会社形式/編成の参照検証、車両の複数編成重複所属拒否、同一線路上での車両配置区間重複拒否、予約と配置の不整合拒否、`OperatingTrain` の編成参照検証・重複運行拒否、採番ID競合検証を追加。
- `migrateVersion8` を実装し、version 8 (旧セーブ) からの移行において `operatingTrains` を空配列 `[]` へクリアし（仮車両生成なし）、`fleet` および初期採番IDを補給して `version: 9` へ移行する処理を構築。
- `tests/persistence.test.ts` にて、version 8からの移行テスト、`version: 9` の保存・復元（ラウンドトリップ）テスト、および不変条件違反データ読込拒否テストを追加・修正。

### Checkpoint B（取得と編成編集）
- テスト用仮想機関車 (`test-virtual-locomotive`) を `data/vehicles/locomotives.yaml` に追加し、データ駆動型の完成編成テンプレート定義 (`data/vehicles/formation-templates.yaml` および `src/data/formationTemplateCatalog.ts`) を追加。
- `src/simulation/fleet.ts` において連結器適合検証関数 (`assertMechanicalConnection`, `assertAllAdjacentConnections`) およびブレーキ警告算出関数 (`formationWarnings`) を整理・エクスポート。
- `src/simulation/commands.ts` の `MapCommand` へ Checkpoint B の共通命令 (`fleet.vehicle.acquire`, `fleet.formation-template.acquire`, `fleet.formation.create`, `fleet.formation.rename`, `fleet.formation.delete`, `fleet.formation.vehicle.add`, `fleet.formation.vehicle.remove`, `fleet.formation.vehicle.move`, `fleet.formation.vehicle.reverse`) を実装。
- `getFormationOperationalStatus` に基づく編集・削除ロック判定（`placed`, `reserved`, `operating` 状態での編集拒否）を実装。
- 車両の複数編成重複所属拒否、連結器非互換拒否、原子的テンプレート取得（失敗時のロールバック保証）、貫通ブレーキ不連続警告算出を実装。
- `tests/fleetCommands.test.ts` にて、個別車両無償取得、原子的テンプレート取得、編成作成・改名・削除、車両追加・取り外し・移動・反転、連結器拒否・ブレーキ警告、編集ロックの単体テストを追加。

### Checkpoint C（駅構内配置）
- `src/data/vehicleCatalog.ts` の `VehicleDesign` へ `dimensions` オプションプロパティを追加。
- `src/simulation/fleet.ts` に `getFormationLengthM` を実装し、カタログ寸法の合計（不足時20m/両）による簡易編成長算出を追加。
- `src/simulation/commands.ts` の `MapCommand` へ `fleet.formation.place` および `fleet.formation.unplace` を実装。
- 駅停車範囲内判定 (`stopPoint.startDistanceM <= distanceM <= stopPoint.endDistanceM`)、線路境界判定、空編成拒否、未配置以外の状態ロック判定、同一線路上占有区間重複拒否、駅中央位置からの初期向き算出 / `orientation` 明示保存を実装。
- `station.delete` および `track.delete` において、配置編成がある場合のエラー保護処理を追加。
- `src/simulation/persistence.ts` の `validateMapState` にて、配置位置の駅停車範囲内検証および空編成配置拒否を追加。
- `src/ui/renderer.ts` の `drawMap` にて、`vehiclePlacements` の地図上描画（占有区間の強調表示、編成名ラベルおよび予約状態の色分け識別）を実装。
- `tests/fleetCommands.test.ts` に Checkpoint C 用の単体テスト（正常配置・配置解除、駅範囲外拒否、線路はみ出し拒否、同一線路上重複拒否、空編成拒否、再配置ロック拒否、駅・線路撤去保護、初期向き・方向明示指定）を追加。

### Checkpoint D（経路と発車）
- `src/simulation/commands.ts` に `fleet.dispatch.reserve` および `fleet.dispatch.cancel` を実装。
- 即時発車（`departureTimeMs <= currentTimeMs`）および未来の絶対日時一回予約（`departureTimeMs > currentTimeMs`）をサポート。
- 発車予約の検証処理（編成が `unplaced` 以外なら拒否、始発駅・始発線路の一致検証、速度制限 `0 < requestedSpeedKph <= 500 km/h`）を構築。
- `simulation.tick` 実行時に予約時刻へ到達した予約を自動実行し、列車生成（`OperatingTrain`）および配置解除を実施。
- `advanceOperatingTrains` にて、終着駅到達時に空き位置があれば自動配置、他編成重複等で配置不能な場合は `awaiting-placement`（回収待ち）状態として保持。
- 既存の `train.dispatch` 命令を改修し、仮編成の自動生成（synthesis）を完全撤去。編成存在・非空・配置状態・経路適合性を厳密に検証し `fleet.dispatch.reserve` と同等ロジックに統一。

### Checkpoint E（車両UI統合と最終調整）
- トップバーに「車両」タブを有効化（`<button data-mode="vehicle">車両</button>`）。
- `src/ui/fleetView.ts` を作成: Fleet UI 状態定義（`FleetUiState`）、ゲーム内日時フォーマッタ（`formatGameTime`）、日時パーサ（`parseGameTimeText`）、状態バッジ helper 類を構築。
- `src/ui/fleetPanel.ts` を作成: 左パネル（編成一覧・フィルター、保有車両一覧、テスト用車両・テンプレート無償取得）および右パネル（編成詳細、車両連結順序操作、未所属車両追加、配置起動、削除/配置解除、即時/予約発車フォーム）のHTMLレンダラーを実装。
- `src/ui/keybindings.ts` に `placement.toggleOrientation` キーバインド（`R` / `r` キー）を追加。
- `src/ui/renderer.ts` に `drawPlacementPreview` を実装: 配置ツール選択時に駅停車範囲内のスナップ、占有範囲のガイド表示、配置方向矢印（→/←）、反転操作ヒント（R）、エラーメッセージを表示。また、回収待ち編成の `OperatingTrain` に `[配置回収待ち]` タグを描画。
- `src/main.ts` へ Fleet UI および配置ツール（`tool === "placement"`）を完全に統合。
  - `pointermove`: 駅停車範囲内スナップ、向き自動決定、Rキー反転トグル、エラー検証のプレビュー更新。
  - `pointerdown`: 有効プレビュー位置へのクリックで `fleet.formation.place` を実行。
  - `window.keydown`: R キーによる配置向き反転トグル。
  - Fleet UI のボタン操作（編成作成・改名・削除、車両追加・移動・取り外し・反転、無償取得、配置・配置解除、即時/予約発車・予約取消）イベントを完全配線。
- 全UI表記を日本語で統一。
- `tests/fleetDispatch.test.ts` に発車予約・予約取消・旧命令ガード・回収待ち状態の統合テストを追加。

## 検証結果

- `npx tsc --noEmit` / `npm run build`: 全コンポーネントおよびメインUIを含めビルド成功。
- `npm test`: 全19テストファイル / 239テストがすべて成功（100%パス）。
- ブラウザスモークテスト:
  - 車両タブの表示、無償テンプレート取得、編成一覧・詳細・編集UIの操作でコンソールエラーが発生しないことを確認。
  - 駅〜終着駅のフル手動UI走行操作は未実施（自動統合テストで配置・予約・発車・走行・終着回収の全フローを検証済み）。

## 未確認事項・残作業

- ブラウザ上での駅〜終着駅フル手動UI走行操作の目視確認（自動テストではカバー済み）。
- 終着駅で配置不能な場合のUI表現改善は将来課題。
- 将来の経済、車庫、ダイヤ、性能計算は本Task完了後に独立Task化する。
