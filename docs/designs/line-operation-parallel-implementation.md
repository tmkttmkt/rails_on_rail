---
md_class: history
id: design-line-operation-parallel-implementation
type: design
status: proposed
created: 2026-08-16
epic: epic-phase-minus-one
task: task-structure-lines-service-systems-and-operations
relations:
  - design-line-service-domain-model
  - design-train-run-state-machine-and-command-api
  - design-line-and-operation-testing-matrix
---

# Design: 路線・系統・経路・運行・運用の並行実装計画

## 目的

複数エージェントまたは開発者が、同じファイルを同時編集せずに実装できるよう、先行契約、作業パッケージ、所有ファイル、依存関係、統合順序を定める。

## 基本方針

- 作業ごとにbranchまたはworktreeを分離する。
- 共通契約を先に統合し、そのコミットを全作業の起点にする。
- 機能実装は新規モジュールへ分離し、巨大な `commands.ts` へロジックを追加しない。
- `commands.ts` はコマンド振り分け、`main.ts` はUI接続だけを担当する。
- 各パッケージは専用テストファイルを持ち、既存テストの大規模書換えを避ける。
- 最終統合担当だけが状態バージョン、中央コマンドunion、画面タブ接続をまとめて変更する。

## Phase 0: 共通契約の固定（並行作業開始前）

### P0 — Contract / Integration Scaffold

担当範囲:

- `src/simulation/serviceModel.ts` を新設し、`ServiceSystem`、`Route`、`Operation`、`VehicleDuty`、`VehicleDutyExecution`、`OperationExecution` の型を定義する。
- `src/simulation/serviceCommands.ts` を新設し、各領域のコマンド型とハンドラー登録インターフェースを定義する。
- `MapState` のv11コレクション名とID規約を確定する。
- 空状態を生成できるところまで `model.ts` と `commands.ts` を最小変更する。

専有ファイル:

- `src/simulation/model.ts`
- `src/simulation/commands.ts`
- `src/simulation/serviceModel.ts`
- `src/simulation/serviceCommands.ts`

完了ゲート:

- TypeScript buildが通る。
- 空のv11状態を生成できる。
- 公開型、状態キー、コマンド名が凍結される。

P0完了前は、後続担当は設計確認とテストケース作成だけを行い、共通型を独自に作らない。

## Phase 1: 並行作業パッケージ

### P1 — 路線・系統

依存: P0

所有ファイル:

- `src/simulation/lineServiceSystem.ts`（新規）
- `tests/serviceSystemV11.test.ts`（新規）

責務:

- 路線・系統のCRUDと検証
- 系統の親路線制約
- 名称、略称、色、説明、表示順
- 表示色の導出

変更禁止: `model.ts`、`commands.ts`、`main.ts`、`persistence.ts`

### P2 — 経路・物理経路

依存: P0

所有ファイル:

- `src/simulation/routeDomain.ts`（新規）
- `src/simulation/pathfinding.ts`
- `tests/routeDomainV11.test.ts`（新規）

責務:

- 経路CRUD、地点・方向・legs
- 区間別路線・系統割り当てと連続性検証
- 接線適合探索と経路の最小半径集計

注意: `inspection.ts` は直接変更せず、必要な確認関数は `routeDomain.ts` からexportする。

### P3 — 運行・複数日ダイヤ

依存: P0。Route型だけに依存し、P2の実装完了は不要。

所有ファイル:

- `src/simulation/operationSchedule.ts`（新規）
- `tests/operationScheduleV11.test.ts`（新規）

責務:

- 運行CRUD
- 曜日、期間、例外日
- 任意の複数日 `dayOffset` と着発時刻順
- 経路変更時の要確認状態

### P4 — 運用・編成差し替え

依存: P0。Operation型だけに依存し、P3の実装完了は不要。

所有ファイル:

- `src/simulation/vehicleDuty.ts`（新規）
- `tests/vehicleDutyV11.test.ts`（新規）

責務:

- 運行の順序、`serviceDayOffset`
- 同一駅・同一番線での接続検証
- 通常編成と日別差し替え
- 編成競合と運休指定

既存 `trainRun.ts` はこの段階では変更しない。実行状態との接続は統合担当が行う。

### P5 — 保存移行

依存: P0。P1〜P4の公開検証関数をstub可能なため並行開始可。

所有ファイル:

- `src/simulation/persistence.ts`
- `tests/persistenceV11.test.ts`（新規）

責務:

- v11の保存・ロード・全参照検証
- v10からの決定論的移行
- 復元不能な区間境界の警告
- ロードの原子性

`tests/persistence.test.ts` は既存版互換テストとして維持し、統合時に期待バージョンだけ更新する。

### P6 — UI部品

依存: P0。各コマンドの型だけを使用する。

所有ファイル:

- `src/ui/routePanel.ts`（新規）
- `src/ui/schedulePanel.ts`（新規）
- `src/ui/vehicleDutyPanel.ts`（新規）
- `tests/servicePlanningUiV11.test.ts`（新規）

責務:

- 経路、運行、運用の独立パネル
- 複数日表記と日別編成差し替え
- 用語ヘルプ
- コマンド生成まで。`main.ts` へのタブ接続は行わない。

既存 `linePanel.ts` のv11対応はP1の公開API統合後に統合担当が行う。

### P7 — AI / Preflight

依存: P0。P2〜P4の検証関数インターフェースに依存する。

所有ファイル:

- `src/simulation/serviceInspection.ts`（新規）
- `tests/serviceInspectionV11.test.ts`（新規）

責務:

- 単一 `inspect(command, revision)` API
- 経路、運行、運用の詳細結果
- バッチの仮状態検証と原子性

既存 `inspection.ts` の線路検査は再利用し、直接変更しない。

## Phase 2: 統合（単独担当）

### P8 — Application Integration

依存: P1〜P7

専有ファイル:

- `src/simulation/model.ts`
- `src/simulation/commands.ts`
- `src/simulation/selectors.ts`
- `src/simulation/guards.ts`
- `src/simulation/trainRun.ts`
- `src/main.ts`
- `src/ui/linePanel.ts`
- `src/ui/operationPanel.ts`（廃止または互換ラッパー化）
- `tests/lineDomain.test.ts`
- `tests/operations.test.ts`
- `tests/lineAndOperationUi.test.ts`
- `tests/persistence.test.ts`

統合作業:

1. 各領域ハンドラーを中央コマンドへ登録する。
2. セレクターと削除ガードをv11参照関係へ更新する。
3. `trainRun.ts` を運行実行・運用割り当てへ接続する。
4. 新UIパネルを `main.ts` へ接続する。
5. v10互換APIを除去または明示的な移行アダプターへ限定する。
6. 既存テストをv11の期待値へ更新する。

## 依存関係

```text
P0 Contract
├─ P1 Line/System ───────┐
├─ P2 Route ─────────────┤
├─ P3 Operation ─────────┤
├─ P4 VehicleDuty ───────┼─> P8 Integration
├─ P5 Persistence ───────┤
├─ P6 UI Components ─────┤
└─ P7 Preflight ─────────┘
```

P3とP4は公開型に対して実装するため、P2とP3の完成を待たず並行可能である。P7は未実装関数をmockして単体テストし、P8で実関数へ接続する。

## ブランチ・worktree名の例

```text
work/v11-contract
work/v11-line-system
work/v11-route
work/v11-operation
work/v11-duty
work/v11-persistence
work/v11-ui
work/v11-preflight
work/v11-integration
```

commit、push、mergeは依頼された場合だけ行う。共有ワークスペースで直接並行編集せず、worktreeを分ける。

## 引き渡し契約

各担当は次を残す。

- 変更ファイル一覧
- 公開export一覧
- 実行したテストと結果
- 未実装またはmockした依存
- 設計との差異
- 統合担当が行う接続手順

## 検証順序

1. 各P1〜P7の専用テスト
2. P8で `npm test`
3. `npm run build`
4. v10 fixtureのv11移行と往復保存
5. ブラウザで路線・系統→経路→運行→運用→発車を一巡
6. 人間による用語、操作感、複数日表示の確認
