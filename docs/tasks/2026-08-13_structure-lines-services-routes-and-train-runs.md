---
md_class: history
id: task-structure-lines-services-routes-and-train-runs
type: task
created: 2026-08-13
status: cancelled
owners:
  - codex
relations:
  - task-structure-lines-service-systems-and-operations
  - design-line-service-route-and-train-run-model
  - design-line-service-domain-model
  - design-train-run-state-machine-and-command-api
  - design-physical-route-creation-and-pathfinding
  - design-persistence-migration-and-reference-protection
  - design-line-and-operation-ui-ux-design
  - design-ai-command-and-preflight-inspection
  - design-line-and-operation-testing-matrix
  - design-route-and-train-movement
  - design-one-shot-scheduled-dispatch
  - design-vehicle-management-ui
epic: epic-phase-minus-one
---

# Task: 路線・運行系統・運行経路・個別列車運行を分離して統合する

> [!WARNING]
> **本Taskはキャンセルのため過去実装記録として保存されています**
>
> 本Taskで提案・実装された「`ServicePattern`が方向・停車パターン・物理経路を所有し、`ServicePattern`が複数路線へ所属する」所有権階層モデルは、プロダクト方針の見直しにより**却下**されました。
> 現在のコード実装（v10データモデル）は旧モデルに従っており、後続の代替Taskにて新モデル（独立した`OperationDefinition`/運行モデル、単一路線所属の`ServiceSystem`/系統モデル）へリファクタリングされる対象（superseded work）となります。
>
> 正式の後継・代替Task: [路線・運行系統・運行および実運用を分離して統合する (2026-08-16)](2026-08-16_structure-lines-service-systems-and-operations.md)

## 目的・背景

[購入可能な車両・編成をゲーム状態へ統合し駅から運行する](2026-08-13_integrate-purchasable-fleet-and-scheduled-dispatch.md)では、実在編成の配置、一回限りの発車予約、列車走行、終着後の返却までを実装した。一方、現行の`OperationRoute`は駅ID列と探索結果だけを持ち、「路線」「列車サービスの種類」「物理経路」「特定日時に走る一本」が分離されていない。

そのため現在は、始発駅が一致しても配置線路が経路の始発線路と違う候補が車両画面に表示され、発車時になって拒否される。また、直通運転、上下方向、同一系統の複数便、路線別表示を一貫して表現できない。

本Taskでは、路線、運行系統、運行経路、個別列車運行を独立した責務としてモデル化し、地図上で停車線路まで確定した経路を作成し、配置編成へ発車可能な運行だけを割り当てられるところまで統合する。

## 確定方針

- `Line`は複数の運行系統をまとめる営業・表示上の分類とする。
- `ServicePattern`は停車パターンと方向別経路をまとめる運行サービスとする。
- `ServicePattern`は複数の`Line`へ所属できる。
- 個別列車運行は路線へ直接所属せず、`ServicePattern`から所属路線を継承する。
- `OperationRoute`は`ServicePattern`に従属し、停車駅だけでなく停車線路と線路上経路を保持する。
- `TrainRun`は特定日時、経路、編成を結び付ける一回の運行とする。
- 車両画面では経路を作成せず、現在の編成配置から発車可能な確定済み経路だけを選択する。

## 責任範囲

### 1. 状態モデルと保存移行

- `Line`、`ServicePattern`、停車線路を持つ`OperationRoute`、`TrainRun`を`MapState`へ追加する。
- ID参照、重複、所属関係、経路と停車点の整合性を保存検証へ追加する。
- 現行の`routes`、`dispatchReservations`、`operatingTrains`を失わない保存形式移行を定義する。
- 既存の一回予約と走行列車を、個別列車運行のライフサイクルから追跡できるようにする。

### 2. 路線と運行系統

- 路線を作成、改名、色変更、削除できる。
- 運行系統を作成、改名、削除できる。
- 運行系統を複数路線へ所属・所属解除できる。
- 所属路線を個別列車運行へ重複保存せず導出する。
- 使用中の路線・運行系統を削除する場合の拒否または明示的な依存解除規則を設ける。

### 3. 停車線路を指定する運行経路作成

- 地図上で始発、経由、終着の駅停車線を順番に選択する。
- 各停車点について駅ID、線路ID、線路上距離、進行方向を確定する。
- 停車点間の線路経路を接線適合な接続グラフから探索する。
- 経路プレビューを表示し、接続切れ、接線不適合、到達不能を確定前に示す。
- 確定した経路を運行系統へ方向名付きで所属させる。
- 線路・駅変更で既存経路が無効になった場合、黙って別経路へ変えず無効状態として識別する。

### 4. 個別列車運行

- 運行系統と経路を選び、発車日時、編成、暫定速度、停車時間を設定する。
- 同じ運行系統から複数の個別列車運行を作成できる。
- 即時発車も現在時刻を持つ個別列車運行として扱う。
- 予約、運行中、完了、取消、失敗の状態を一つの運行IDで追跡する。
- 配置編成、経路始発停車点、進行方向の不一致を予約作成前に拒否する。

### 5. UI統合

- 「路線」タブを有効化し、路線と所属運行系統を管理できるようにする。
- 「運行」タブに運行系統一覧、方向別経路、個別列車運行一覧を配置する。
- 地図上の経路作成ツールを提供し、選択中の停車線路と経路を視覚化する。
- 車両画面の経路候補を、始発駅だけでなく始発線路・配置方向まで一致するものへ絞る。
- UIとAI操作は同じ`MapCommand`を利用する。

### 6. AI操作・確認API

- AIが路線、運行系統、停車線路付き経路、個別列車運行を共通命令で作成できるようにする。
- 確定前確認APIで到達不能区間、不正接続、参照切れ、始発配置不一致を返す。
- AI向け文書へ概念の違い、作成順序、必須参照、エラー応答を記載する。

## 対象外

- 毎日・曜日・休日・周期運転を含む反復ダイヤ
- 折返し編成の自動着回しと車両運用表
- 運行中の分割・併合、機関車付替え、機回し
- 信号、閉塞、列車競合、待避、遅延回復
- 需要、運賃、収益、営業係数
- 車両性能と線路条件による実速度計算
- ホーム有効長、軸重、電化、車両限界による運行可否

## チェックポイント

### Checkpoint A: 概念と保存

- [x] 4概念の責務と参照関係が型で分離されている
- [x] 保存検証が参照切れと不正所属を拒否する
- [x] 現行セーブを情報欠落なく移行できる

### Checkpoint B: 路線・運行系統

- [x] 路線と運行系統を作成・編集できる
- [x] 一つの運行系統を複数路線へ所属させられる
- [x] 個別運行の所属路線を運行系統から導出できる

### Checkpoint C: 運行経路

- [x] 駅の停車線路を順番に指定して経路を作成できる
- [x] 地図上で確定前経路を確認できる
- [x] 到達不能または不正接続を確定前に拒否できる
- [x] 上下・方向別の複数経路を同じ運行系統へ所属させられる

### Checkpoint D: 個別列車運行

- [x] 同じ運行系統から複数の時刻・編成の運行を作れる
- [x] 即時、予約、運行、完了、取消、失敗を同じ運行IDで追跡できる
- [x] 配置位置と始発停車点が一致する場合だけ予約・発車できる

### Checkpoint E: UI・AI統合

- [x] 路線画面と運行画面から主要操作が完結する
- [x] 車両画面に本当に発車可能な経路だけが表示される
- [x] UIとAIが共通命令を使用する
- [x] 確認APIが運行関係の不整合を列挙する

## 完了条件

- [x] 路線、運行系統、運行経路、個別列車運行が独立したIDと責務を持つ
- [x] 運行系統が複数路線へ所属でき、個別運行から所属路線を導出できる
- [x] 運行経路が各駅の停車線路と駅間走行線路を保持する
- [x] 始発駅は同じでも始発線路が違う経路は、配置編成の発車候補に出ない
- [x] 複数便を同じ運行系統から作成し、それぞれ別の編成と時刻を割り当てられる
- [x] 接続切れ・接線不適合を通る経路を作成または運行できない
- [x] 保存・再読込後も所属、経路、運行状態が一致する
- [x] UIとAI操作で同じ結果が得られる
- [ ] 自動テストとブラウザ手動確認で主要フローを検証する

## 検証方法

### 単体・統合テスト

- 路線と運行系統の多対多所属
- 削除・参照切れ・重複所属の境界条件
- 停車線路を固定した経路探索
- 直交交差・不正ジャンクションを経路が通らないこと
- 同一系統から複数便を作ること
- 配置線路・方向不一致の事前拒否
- 旧保存形式からの移行と新形式の往復保存
- 即時発車、予約時刻到達、終着、失敗、取消

### ブラウザ確認

1. 路線を2つ作成する。
2. 一つの直通運行系統を両路線へ所属させる。
3. 上下の停車線路付き経路を地図上で作る。
4. 二つの編成をそれぞれ始発線路へ配置する。
5. 同じ運行系統から時刻の異なる二つの個別運行を作る。
6. 不一致経路が車両画面へ表示されないことを確認する。
7. ゲーム時間を進め、両運行が一度ずつ発車・終着することを確認する。
8. 保存・再読込後も路線所属と運行履歴が一致することを確認する。

## 方針・判断

- 公開データ関係の正本は[路線・運行系統・運行経路・個別列車運行の関係](../designs/line-service-route-and-train-run-model.md)とする。
- 「運行」を曖昧な総称として型名に使わず、再利用可能な運行系統と一回の個別列車運行を区別する。
- 経路探索結果は駅ID列だけから毎回暗黙に決めず、停車線路を含む確定内容として保存する。
- 線路変更後の自動再探索は意図しない番線変更を起こし得るため、本Taskでは無効化と再確認を優先する。
- 現行の単発予約機能を破棄せず、段階的に個別列車運行へ移行する。

## 関連文書

- [先行Task: 購入可能な車両・編成をゲーム状態へ統合し駅から運行する](2026-08-13_integrate-purchasable-fleet-and-scheduled-dispatch.md)
- [路線・運行系統・運行経路・個別列車運行の統合方針](../designs/line-service-route-and-train-run-model.md)
  - [ドメイン集約と参照・所有権モデル](../designs/line-service-domain-model.md)
  - [個別列車運行状態遷移マシンと MapCommand / API 設計](../designs/train-run-state-machine-and-command-api.md)
  - [物理運行経路のインタラクティブ作成とパスファイディング](../designs/physical-route-creation-and-pathfinding.md)
  - [保存形式移行と参照保護 (削除ガード)](../designs/persistence-migration-and-reference-protection.md)
  - [路線・運行タブ UI/UX 設計と車両画面フィルタ](../designs/line-and-operation-ui-ux-design.md)
  - [AI コマンド体系と確定前事前検証 (Preflight Inspection)](../designs/ai-command-and-preflight-inspection.md)
  - [テスト・受入検証マトリクス](../designs/line-and-operation-testing-matrix.md)
- [駅間経路と列車移動](../designs/route-and-train-movement.md)
- [一回限りの時刻指定発車](../designs/one-shot-scheduled-dispatch.md)
- [車両管理UI](../designs/vehicle-management-ui.md)
- [接線適合な線路接続Task](2026-08-13_tangent-valid-railway-connectivity.md)

## 作業結果

1. `commands.ts`: `servicePattern.updateDirection` および `servicePattern.deleteDirection` コマンドを追加し、方向の名称変更・停車パターン更新・削除をアトミックに実行可能とした。
2. `uiHelpers.ts`: 路線所属複数選択トグル、StopPatternの順序入替（Move Up/Down）・追加・削除・停車/通過・ dwellSeconds 更新、厳密な `StationStopPoint` ドロップダウン選択肢生成、経路事前検証 (`getPreflightInspectionResult`) などの純粋 UI ヘルパーモジュールを新設。
3. `linePanel.ts`: 路線（作成・編集・削除）、運行系統（作成・編集・削除）、複数路線所属 UI (マルチチェックボックス)、方向追加/編集/削除（「上り」「下り」クイックボタン、`window.prompt`廃止）、順序付き StopPattern エディタを完全実装。
4. `operationPanel.ts`: 運行系統・方向の連動ドロップダウン選択、方向のStopPatternに沿った ordered StopPattern builder、各停車駅の exact `StationStopPoint` ドロップダウン・地図クリック連動選択、通過指定（dwellSeconds 0かつ経路拘束）、事前検証 (Preflight Inspection) によるリアルタイム緑/赤ステータス表示、初期バージョン 1物理経路/方向 の案内、`TrainRun` 作成および車両配置適合性フィルタリングを完備。
5. `renderer.ts`: Operation Route Builder 作成中に確定前経路 (Preflight Route Overlay) をリアルタイムでマップ上に緑色/赤色で描画するオーバーレイ機能を追加。
6. `lineAndOperationUi.test.ts`: UIヘルパー、順序入替、複数所属、事前検証、新方向コマンドに関する単体テストを追加。
7. テスト・ビルド: `npm test`（164テスト全通過）および`npm run build`（tsc & vite build）の成功を確認。
8. ブラウザ確認で路線・運行モードの親パネルが非表示になる問題を発見し、`setMode`の表示対象へ両モードを追加して修正した。

## 検証結果

- `npm test`: 15テストファイル・164テスト全パス。
- `npm run build`: tsc 型チェックおよび Vite プロダクションビルドがエラーなしで成功。

## 未確認事項・残作業

- ブラウザで路線タブ、路線作成、運行系統作成、運行タブ表示までを確認し、コンソール警告・エラーがないことを確認した。
- 駅・停車線路付き経路の作成から複数TrainRunの発車・終着・保存再読込までのフル手動確認は未実施。

## 引き継ぎ

Phase-1 路線・運行系統・運行経路・個別列車運行のUI、ドメイン、共通命令、事前検証を実装した。Taskは`review`とし、実マップを使ったブラウザのフル手動確認後に`done`へ移す。
