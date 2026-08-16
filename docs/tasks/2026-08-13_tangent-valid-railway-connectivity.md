---
md_class: history
id: task-tangent-valid-railway-connectivity
type: task
created: 2026-08-13
status: done
owners:
  - antigravity
relations:
  - task-inspect-ai-map-connectivity
  - task-replace-existing-track-connector-with-biarc
epic: epic-phase-minus-one
---

# Task: 接線適合な線路接続とトポロジー判定の実装

## 目的・背景

90度直交交差などの接線不連続な接続点がトポロジー接続や列車経路として誤認識されないよう、接線適合（G1連続）判定と曲線自動拘束を導入する。

## 責任範囲

- 共通の接線適合規則およびヘルパー関数（`calculateTangentAngleDifferenceRad`, `isTangentContinuous`, `getTrackPortTangent`）の定義と許容誤差（5度）の明確化。
- 接続先指定時の曲線敷設における接線自動設定（`startTangent` / `endTangent`）とG1連続な円弧群生成。
- 接続先指定時の非適合直線敷設に対する明確なエラー返却および、非接続な直交交差の非接続維持。
- トポロジーグラフ（`inspectTopology`）および列車経路探索（`findStationRoute`）での接線適合接続点限定評価と、検査結果への`invalidConnections`詳細の拡張。
- 既存保存データに対する安全な読み込み維持と非適合接続の非走行化。
- AI向け外部操作ガイド（`docs/ai-operations.md`）の更新。
- 集中テスト（`tests/tangentConnectivity.test.ts`）の追加と全テスト・ビルドの検証。

## 完了条件

- [x] 90度直交交差がトポロジー上非接続として評価される
- [x] 同一線上の逆向き接続が適合接続として評価される
- [x] 明示的な接線指定なしの分岐曲線が適合・平滑に生成される
- [x] 両端接続のAI生成曲線が両端でG1連続になる
- [x] 検査API（`inspectTrackRadii`）が`invalidConnections`詳細を返す
- [x] 列車経路探索が接線不適合接続点を通過しない
- [x] `npm test` および `npm run build` が成功する

## 実装結果

- `src/simulation/geometry.ts` へ 5度許容誤差（`TANGENT_ANGLE_TOLERANCE_RAD`）に基づく接線適合判定関数を定義した。
- `src/simulation/commands.ts` の `track.create` で、曲線敷設時の接続先接線方向自動適用と、接線非適合直線接続の日本語エラー拒否を実装した。
- `src/simulation/operations.ts` の `findStationRoute` で接線適合接続点のみをグラフエッジとして登録するようにした。
- `src/simulation/inspection.ts` の `inspectTopology` で接線適合接続点のみを接続成分とし、不適合接続点を `invalidConnections` へ記録するように拡張した。
- `tests/tangentConnectivity.test.ts` を追加し、6件の集中テストをすべて通過させた。

## 検証結果

- `npm test`: 20テストファイル、245件すべてのテストに成功。
- `npm run build`: TypeScript型検査およびViteプロダクションビルドに成功。
