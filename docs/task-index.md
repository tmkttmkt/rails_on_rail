---
md_class: status
updated: 2026-08-11
---

# Task一覧

現在は手動で管理する。Taskを作成または更新した変更と同時に、この一覧も更新する。

現在のEpic: [Phase -1 技術プロトタイプ](epics/phase-minus-one.md)

## 進行中

| Status | Task | Epic |
|---|---|---|
| `review` | [ゲーム内時間を実装する](tasks/2026-08-11_simulation-clock.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [蒸気機関車運用テストマップを生成する](tasks/2026-08-11_steam-operations-test-map.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [明示的な保存操作だけでサーバー同期する](tasks/2026-08-11_explicit-save-server-sync.md) | [Phase -1](epics/phase-minus-one.md) |
| `design` | [UIエリアの役割定義とナビゲーション構造](tasks/2026-08-10_ui-navigation-structure.md) | 横断 |
| `design` | [キーボード操作の全面拡張](tasks/2026-08-10_keyboard-driven-operations.md) | 横断 |
| `design` | [建設モードUI再設計](tasks/2026-08-10_construction-ui-redesign.md) | 横断 |
| `active` | [AI連携用APIのVite組み込み (agy実装)](tasks/2026-08-10_ai-api-integration.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [駅間経路探索と列車移動を試作](tasks/2026-08-09_route-and-train-movement-prototype.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [線路上の停車地点として駅を試作](tasks/2026-08-09_station-stop-point-prototype.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [線路接続構造と現行文書の安定化](tasks/2026-08-09_stabilize-track-topology-and-docs.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [一本以上の接続で束分岐を許可し重ねがけを拒否](tasks/2026-08-09_allow-partial-bundle-branch-and-reject-overlap.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [N/Mで線路群の接続対応を調整](tasks/2026-08-09_adjust-bundle-connection-with-nm.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [キーボード割当の一元管理](tasks/2026-08-09_centralize-keybindings.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [個別線路を実体にして線路群を再編可能にする](tasks/2026-08-09_independent-tracks-and-groups.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [名前付き複数セーブ](tasks/2026-08-09_named-save-slots.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [マップの保存と読込](tasks/2026-08-09_map-save-and-load.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [線路自体の描画改善](tasks/2026-08-09_track-canvas-rendering.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [参考作品に沿った単純な地図UI](tasks/2026-08-09_simplify-reference-game-ui.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [曲線生成を円弧チェーンへ置換](tasks/2026-08-09_replace-curve-with-arc-chain.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [曲線半径とカントのゲーム実装](tasks/2026-08-09_curve-radius-and-cant.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [車両個体・編成・列車の最小実装](tasks/2026-08-09_fleet-formations-and-trains.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [車両データと連結・ブレーキ互換性](tasks/2026-08-09_vehicle-data-and-connection-compatibility.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [法的状態データ領域の定義](tasks/2026-08-09_define-legal-data.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [軌道構成データのゲーム統合](tasks/2026-08-09_track-construction-data-integration.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [鉄路データ定義の再構築](tasks/2026-08-08_rebuild-track-data.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [複数線路間の個別接続](tasks/2026-08-08_individual-track-connections.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [N本の線路を同時敷設](tasks/2026-08-08_parallel-track-building.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [敷設中線路の終点吸着](tasks/2026-08-08_track-end-snapping.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [線路の延長操作と途中分岐](tasks/2026-08-08_track-extension-and-branching.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [曲線線路の敷設](tasks/2026-08-08_curved-track-building.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [自由マップ線路敷設プロトタイプ](tasks/2026-08-08_free-map-track-building.md) | [Phase -1](epics/phase-minus-one.md) |

## 完了

現在、完了したTaskはない。

## 中止

| Status | Task | 後継 |
|---|---|---|
| `cancelled` | [最初の操作可能な鉄道プロトタイプ](tasks/2026-08-08_first-interactive-prototype.md) | [自由マップ線路敷設プロトタイプ](tasks/2026-08-08_free-map-track-building.md) |

## 今後の候補

- Phase -1の技術選定と開発環境構築
- 座標系と2D描画方式の比較
- 最小ゲーム状態と操作命令の設計

「今後の候補」は着手可能なTaskではない。着手時に目的と完了条件を定義したTask文書へ昇格する。
