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

## 確定した所有関係

```text
Line（路線）
└─ ServiceSystem（系統。必ず1路線に従属）

Route（経路）
├─ 停車・通過地点の順序
├─ 駅内の番線・停止位置
├─ 物理走行経路
├─ 方向
└─ 区間ごとの路線・系統割り当て

Operation（運行）
├─ Routeへの参照
├─ 運行日・曜日・日付条件
└─ 各地点の着発時刻

VehicleDuty（運用）
├─ 担当するOperationの順序
└─ 編成割り当て
```

## 確定方針

- `ServiceSystem` は名称、略称、色、説明、表示順を持つ。色未指定時は親路線色を表示に使用する。
- 系統は単なるまとめに限定せず、支線・直通・区間など路線内の任意の系統アイデンティティを表せる。
- 反対方向は同じ経路の反転ではなく、独立した `Route` とする。方向名は「上り」「下り」を候補に持つ自由文字列とする。
- 路線・系統への所属は運行全体ではなく `Route` の区間単位で表す。1区間の系統は、その区間の路線に従属する系統だけを選べる。
- `Operation` は経路と日時を組み合わせる。同じ経路を異なる日時の複数運行から参照できる。
- 停車地点そのものは経路、着発時刻は運行が所有する。`dayOffset` は複数日を表現でき、運行時間を24時間や翌日までに制限しない。
- `VehicleDuty` は1つ以上の運行を順序付きで担当する。通常編成は任意で、日別の運用実施時に別編成へ差し替えられる。分割併合・着回し・有効長制限は今回対象外。
- 運用内の前後運行は、当面同じ駅・同じ番線でのみ接続可能とする。異番線移動や回送の自動補完は後回しにする。
- 経路の地点追加・削除・並べ替え時は参照運行を要確認状態にする。物理経路だけの変更は地点が同じなら時刻を維持し、経路削除は参照運行があれば拒否する。
- 駅・線路などを経路が参照中の場合、施設変更を拒否し、自動再探索は行わない。

## チェックポイント

### A. 型と保存形式

- [x] `Line`、`ServiceSystem`、`Route`、`Operation`、`VehicleDuty` を実装する。
- [x] 保存形式を v11 に更新し、v10 の系統・方向・経路・予約情報を情報欠落なく移行する。
- [x] ID参照、経路区間、時刻列、運用順序をロード時に検証する。

### B. 路線と系統

- [x] 路線と、その路線に従属する系統を作成・編集・削除できる。
- [x] 系統の名称、略称、色、説明、表示順を編集できる。
- [x] 系統から停車駅、方向、物理経路、時刻、編成の所有を除去する。

### C. 経路

- [x] 停車・通過地点、番線、停止位置、方向を指定できる。
- [x] 地点間の接線適合な物理走行経路を探索・確認・保存できる。
- [x] 経路を区間へ分け、各区間に路線と任意の系統を設定できる。
- [x] 区間の連続性、系統の親路線一致、物理経路との対応を検証する。

### D. 運行

- [x] 経路を選択し、運行日条件と地点ごとの着発時刻を設定できる。
- [x] 複数日越し、停車時間、時刻の単調性を検証できる。
- [x] 即時または指定時刻に発車できる。

### E. 運用と車両

- [x] 運行を順序付きで運用へ登録できる。
- [x] 通常編成を任意設定し、日別に編成を差し替えられる。重複割り当ては拒否できる。
- [x] 前運行の終着駅・番線と次運行の始発駅・番線が一致するか確認できる。
- [x] 実行中の状態を `planned`、`reserved`、`operating`、`completed`、`cancelled`、`failed` で管理する。

### F. UI・AI・事前確認

- [x] 「路線・系統」「経路」「運行」「運用」を独立画面として提供する。
- [x] 路線・系統画面から、区間割り当てを事前選択した経路作成へ遷移できる。
- [x] UIとAIが共通コマンドを使用する。
- [x] 経路、運行、運用それぞれに確定前確認APIを提供する。

## 並行実装

実装は[並行実装計画](../designs/line-operation-parallel-implementation.md)に従う。最初に共通型・状態キー・コマンド境界を固定し、その後に経路、運行、運用、永続化、UIを別worktreeで並行実装する。

各担当は割り当てられた新規モジュールと専用テストを主に変更する。`model.ts`、`commands.ts`、`main.ts`、`persistence.ts`、既存の共通テストは統合担当以外が同時編集しない。

## 対象外

- 停車駅属性の高度化、複雑な祝日カレンダー
- 運行中の分割・併合、着回し、機関車交換
- ホーム有効長や車両限界
- 信号・閉塞・遅延伝播、施設変更時の自動迂回

## 受入条件

1. 路線A・Bと、それぞれに従属する系統を作成できる。
2. A線区間からB線区間へ直通する経路を作り、区間ごとの路線・系統を確認できる。
3. 同じ経路を参照する朝・夕の運行を別時刻で作成できる。
4. 複数運行を1つの運用へ順序付きで登録し、配置編成を割り当てられる。
5. 始発駅・番線・向きが不一致の編成は発車不可となる。
6. v10データをv11へ移行し、保存・再読込後も同じ内容になる。

## 実装・検証結果（2026-08-16）

- Antigravity CLI（Gemini 3.7 Flash High）でP0〜P8を実装した。実行時間は約1018秒（約17分）。CLIから正確なトークン使用量は取得できない。
- v11ドメイン、v10移行、共通コマンド、確定前確認、独立UIパネルを実装した。
- `npm test`: 23テストファイル、190テスト成功。
- `npm run build`: TypeScript型検査およびVite本番ビルド成功。
- ブラウザでの一連操作と人間による操作感確認は未実施。確認完了まで状態を `review` とする。

## AIによるヘッドレス受入確認（2026-08-19）

UIと共通の`executeCommand`および事前確認関数を使い、ブラウザを介さず受入条件を再検証した。

- 路線・系統の作成と親路線制約: 成功。
- A線からB線へ区間単位で所属を切り替える直通経路の作成: 成功。
- 同一経路を参照する複数運行、日越し時刻、複数日運用の作成と検証: 成功。
- 運用への複数運行の順序付き登録、通常編成および日別差し替え: 成功。
- 始発駅・番線などの配置条件が不一致な編成の事前確認による拒否: 成功。
- v10からv11への移行、およびv11状態のJSON往復保存: 成功。
- 関連する受入テスト6ファイル19件: すべて成功。
- 全テスト: 23ファイル190件、すべて成功。
- `npm run build`: TypeScript型検査およびVite本番ビルド成功。

機能上の受入条件はヘッドレス確認済み。残る人間確認は、画面表示、操作導線、文言、操作感などUI固有の項目に限定する。

### 人間による確認手順

1. 路線と系統を作成し、系統の略称・色・説明・表示順を編集する。
2. 複数路線を区間単位で割り当てた経路を作成する。
3. 同じ経路から時刻の異なる運行と、2日以上をまたぐ運行を作成する。
4. 複数運行を運用へ登録し、通常編成と日別差し替え編成を設定する。
5. 不一致の駅・番線・向きでは発車できず、理由が表示されることを確認する。

## 関連文書

- [統合方針](../designs/line-service-route-and-train-run-model.md)
- [ドメインモデル](../designs/line-service-domain-model.md)
- [状態遷移とコマンド](../designs/train-run-state-machine-and-command-api.md)
- [経路作成](../designs/physical-route-creation-and-pathfinding.md)
- [保存形式](../designs/persistence-migration-and-reference-protection.md)
- [UI/UX](../designs/line-and-operation-ui-ux-design.md)
- [AI・事前確認](../designs/ai-command-and-preflight-inspection.md)
- [テスト](../designs/line-and-operation-testing-matrix.md)
- [並行実装計画](../designs/line-operation-parallel-implementation.md)
