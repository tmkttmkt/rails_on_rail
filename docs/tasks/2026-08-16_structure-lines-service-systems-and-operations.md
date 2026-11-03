---
md_class: operation
id: task-structure-lines-service-systems-and-operations
type: task
created: 2026-08-16
status: review
owners: [codex]
supersedes: task-structure-lines-services-routes-and-train-runs
epic: epic-phase-minus-one
relations:
  - design-line-service-route-and-train-run-model
  - design-line-service-domain-model
  - design-train-run-state-machine-and-command-api
  - design-physical-route-creation-and-pathfinding
  - design-persistence-migration-and-reference-protection
  - design-line-and-operation-ui-ux-design
  - design-ai-command-and-preflight-inspection
  - design-line-and-operation-testing-matrix
  - design-line-operation-parallel-implementation
---

# Task: 路線・系統・経路・運行・運用を再構築する

## 目的

現行 v10 の `ServicePattern` 中心モデルを、責務が明確な `Line`、`ServiceSystem`、`Route`、`Operation`、`VehicleDuty` へ再構築し、保存形式・UI・AI操作・車両発車まで統合する。

## 確定した所有関係（プロダクトモデル補正版）

```text
Line（路線：運行を分類・グループ化するコンテナ）
└─ ServiceSystem（系統：必ず1路線に従属し、運行を分類・グループ化するコンテナ）

Route（経路：物理的な走行・停車路順のみを所有）
├─ 停車・通過地点の順序（stops）
├─ 駅内の番線・停止位置（trackId, stopPointId）
├─ 物理走行経路（legs）
└─ 方向（directionName）

Operation（運行：経路・時刻・カレンダー・所属分類を所有）
├─ Routeへの任意参照（routeId、未設定時は使用不可の計画下書き）
├─ 路線・系統への所属設定（lineAssignments: 任意・複数路線・親路線あたり最大1系統）
├─ 運行日・曜日・日付条件（calendar）
└─ 各地点の着発時刻・日跨ぎ（stopTimes, dayOffset）

VehicleDuty（運用）
├─ 担当するOperationの順序（assignments）
└─ 編成割り当て（defaultFormationId）
```

## 確定方針

- `Line` および `ServiceSystem` は、`Operation` を分類・集約するためのコンテナ（分類メタデータ）であり、正準データとしての所属関係は `Operation.lineAssignments` に保持する（二重保持しない）。
- `ServiceSystem` は名称、略称、色、説明、表示順を持つ。必ず1つの親路線に従属し、色未指定時は親路線色を表示に使用する。
- `Route` は物理的な走行線路・停車地点・通過地点・番線・停止位置・方向のみを所有し、`lineSections` は持たない。経路作成は路線や系統が存在しなくても単独で実行できる。
- `Operation` は `Route` を参照し、カレンダーと着発時刻に加え、所属分類（`lineAssignments`）を所有する。
- `Operation` は路線・系統が1件も存在しない状態でも作成でき、未所属（`lineAssignments: []` または未指定）のままでも保存・運用可能。
- `Operation` は経路より先に作成・保存できる。`routeId` 未設定時は計画下書きとして保持し、経路と時刻を設定するまで運用への割り当てと発車を禁止する。
- `Operation` は複数路線に所属でき、親路線ごとに最大1つの `ServiceSystem` を設定できる。系統を指定しない路線直属の所属も可能。
- ユーザーの第一導線は `Operation` から開始できる。経路が存在しない場合は運行作成画面からインラインで経路作成へ遷移できる。
- 「路線・系統」画面では、所属する運行一覧の確認・所属追加・解除、および該当路線/系統を事前選択した運行作成ショートカットを提供する。
- 反対方向は同じ経路の反転ではなく独立した `Route` とする。
- `VehicleDuty` は1つ以上の運行を順序付きで担当する。
- 既存の v11 セーブデータに `route.lineSections` が含まれていた場合はロード時に `normalizeVersion11` により `operation.lineAssignments` へ決定論的に正規化・移行し、情報の欠落を防ぐ。

## チェックポイント

### A. 型と保存形式

- [x] `Line`、`ServiceSystem`、`Route`、`Operation`、`VehicleDuty` を実装する。
- [x] 保存形式 v11 において `Route` から `lineSections` を除去し、`Operation` に `lineAssignments` を保持する。
- [x] 既存 v11 データの互換性正規化（`normalizeVersion11`）および v10 からの移行（`migrateVersion10`）を実装する。
- [x] ID参照、路線・系統所属整合性（親路線不一致の拒否等）、時刻列、運用順序をロード時に検証する。

### B. 路線と系統

- [x] 路線と、その路線に従属する系統を作成・編集・削除できる。
- [x] 系統の名称、略称、色、説明、表示順を編集できる。
- [x] 路線・系統画面で所属する運行一覧を表示し、所属追加・解除・事前選択運行作成を行える。

### C. 経路

- [x] 路線・系統の事前作成なしに、停車・通過地点、番線、停止位置、方向を指定して経路を作成できる。
- [x] 地点間の接線適合な物理走行経路を探索・確認・保存できる。
- [x] 経路から `lineSections` を撤廃し、物理走行経路の定義に専念する。

### D. 運行

- [x] 経路を選択し、運行日条件と地点ごとの着発時刻、および路線・系統所属を設定できる。
- [x] 複数日越し、停車時間、時刻の単調性、所属路線の整合性を検証できる。
- [x] 未所属の運行も作成・保存・運用できる。

### E. 運用と車両

- [x] 運行を順序付きで運用へ登録できる。
- [x] 通常編成を任意設定し、日別に編成を差し替えられる。重複割り当ては拒否できる。
- [x] 前運行の終着駅・番線と次運行の始発駅・番線が一致するか確認できる。

### F. UI・AI・事前確認

- [x] 「路線・系統」「経路」「運行」「運用」を独立画面として提供する。
- [x] 運行画面において経路未登録時に経路作成ショートカットを提供し、インラインで路線・系統所属を設定できる。
- [x] 路線・系統画面において所属運行一覧と所属設定・運行作成アクションを提供する。
- [x] UIとAIが共通コマンド（`operation.assignClassification`, `operation.unassignClassification` 等）を使用する。

## 受入条件

1. 路線A・Bと、それぞれに従属する系統を作成できる。
2. 路線・系統に依存せず独立した経路を作成できる。
3. 経路を参照し、路線A・Bや系統に所属する運行、または未所属の運行を作成できる。
4. 路線・系統画面から所属運行の追加・解除および事前選択運行作成ができる。
5. 複数運行を1つの運用へ順序付きで登録し、配置編成を割り当てられる。
6. v10/v11 データを安全に移行・正規化し、保存・再読込後も同じ内容になる。

## 実装・検証結果（2026-08-23）

- モデル補正（`Route.lineSections` 撤廃、`Operation.lineAssignments` への所属集約）を完了。
- `npm test`: 全23テストファイル、191テストすべて成功。
- `npm run build`: TypeScript型検査およびVite本番ビルド成功。
- `generate-operation-review-map.ts` を更新し、`saves/operation-planning-review.json` を新モデル（未所属運行および複数所属運行）で再生成。
- 管理画面の左パネルを格納する `#tools-panel` の表示対象に `line`、`schedule`、`vehicleDuty` を追加し、運行タブ等を選択しても画面が表示されない不具合を修正。
- 表示修正後、`npm test -- tests/servicePlanningUiV11.test.ts`（4テスト）と `npm run build` が成功。
- 運行を経路なしで先に保存できる計画下書きへ対応。経路未設定状態をUIと保存形式で扱い、運用割り当て・発車時は `ERR_OPERATION_INCOMPLETE` として拒否する。
- 変更後、`npm test` は全23ファイル・192テスト成功、`npm run build` も成功。
- ブラウザ確認が残っているため状態は `review` を維持。

### 人間による確認手順

1. 経路が0件の状態で運行を作成し、「経路未設定（使用不可）」として保存できることを確認する。
2. 路線・系統なしで未所属運行を作成・保存できることを確認する。
3. 路線と系統を作成し、運行編集画面または路線画面から運行へ路線・系統を所属付けできることを確認する。
4. 路線・系統画面に所属運行一覧が表示され、所属解除や「＋ 運行作成」ショートカットが動作することを確認する。
5. 作成した運行を運用に組み込み、発車できることを確認する。
