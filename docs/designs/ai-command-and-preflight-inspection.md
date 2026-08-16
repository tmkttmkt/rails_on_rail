---
md_class: history
id: design-ai-command-and-preflight-inspection
type: design
status: proposed
created: 2026-08-16
epic: epic-phase-minus-one
task: task-structure-lines-service-systems-and-operations
relations: [design-line-service-domain-model, design-train-run-state-machine-and-command-api]
---

# Design: AIコマンドと確定前確認

## 原則

AIとUIは同じコマンド・検証器を使用する。変更系コマンドの前に、同じペイロードを受け取る単一の `inspect` APIで候補結果と全エラーを返す。

## 作成順序

```text
line.create
  -> serviceSystem.create
  -> route.create
  -> operation.create
  -> vehicleDuty.create / vehicleDuty.assignFormation
```

## 確定前確認API

```ts
inspect({ command: MapCommand, stateRevision: string }): InspectionResult
```

```ts
interface InspectionResult {
  valid: boolean;
  normalizedCommand?: MapCommand;
  errors: InspectionIssue[];
  warnings: InspectionIssue[];
  effects: InspectionEffect[];
  stateRevision: string;
  details?: RouteInspection | OperationInspection | VehicleDutyInspection;
}
```

### 経路確認

線路単位の接続可否、接線整合、各legの距離・最小半径、経路全体の最小半径、停車地点、区間ごとの路線・系統、参照施設を返す。束単位だけの結果にはしない。

### 運行確認

経路参照、適用日、複数日越しを含む着発時刻順、停車時間不足、同一条件の重複運行候補を返す。`dayOffset` を翌日までに制限しない。

### 運用確認

`serviceDayOffset` を含む運行順、時刻重複、前後運行の駅・番線一致、通常編成と日別差し替え編成の存在、配置適合、他運用との編成競合を返す。

## 確定

`inspect` 後に状態が変わった場合は確定を拒否して再確認する。AIによるバッチ作成も全件を仮状態へ適用して検査し、1件でもエラーなら実状態を変更しない。

## 破壊的操作

削除確認では削除対象だけでなく参照元一覧を返す。自動連鎖削除、施設変更後の自動経路書き換えは提案も実行もしない。
