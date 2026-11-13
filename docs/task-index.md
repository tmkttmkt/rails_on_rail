---
md_class: status
updated: 2026-11-11
---

# Task一覧

現在は手動で管理する。Taskを作成または更新した変更と同時に、この一覧も更新する。

現在の目標は[東上線の土休日一日再現](planning/tojo-holiday-implementation.md)。ベカソヴォ操車場は次の実装対象である。以下の既存Taskは履歴・残作業として保持する。

## 進行中

- `review`: [無意味に分かれた留置線群をまとめる](tasks/2026-11-11_merge-split-siding-groups.md)（同一線路を同じ領域へ、本数上限を撤去。54→35領域）

- `review`: [施設タブで駅グループと駅を詳しく調べ、編集できるようにする](tasks/2026-11-11_inspect-and-edit-stations-in-facility.md)（停車地点一覧・役割内訳・種別変更・領域とグループの削除を追加）

- `review`: [旅客ホーム長を合成180 mからホーム端実測へ戻す](tasks/2026-11-11_restore-platform-edge-ranges.md)（113件中106件を実測化。対象33駅の31駅が200 m以上に。未実測7件は180 mのまま）

- `review`: [駅グループを地図に表示し、施設タブの自動選択をやめる](tasks/2026-11-11_show-station-groups-on-map.md)（倍率でグループと駅部品を切替、施設タブはグループ一覧から開始。画面確認待ち）

- `review`: [営業経路の分岐点での暗黙反転を防ぐ](tasks/2026-11-11_fix-directional-operation-routing.md)（営業・入換の有向探索を共用、試験セーブ再生成済み）

- `review`: [本番との差分に合った検証用UIを整える](tasks/2026-11-11_distinguish-review-workspace.md)（専用補助にラベル・枠を追加し、他UI向けの表示規約を整備）

- `review`: [東上線の近似再現に使う線路・駅・試験編成を整える](tasks/2026-11-10_prepare-tojo-playable-foundation.md)（33駅・上下仮経路・短編成の試験セーブを生成。画面確認待ち）

- `review`: [ホーム画面を追加する](tasks/2026-11-10_home-screen.md)

- `review`: [建設と施設の操作を分離する](tasks/2026-11-10_facility-navigation.md)

- `review`: [構内を用途領域に分割し車両基地グループへまとめる](tasks/2026-11-08_station-complex-areas.md)（川越市の所属範囲と構内編集パネルを調整）

- `review`: [小さな側線で用途指定・車両配置・本線往復を成立させる](tasks/2026-11-08_small-siding-facility-trial.md)

- `review`: [OSMの未確定駅を保持し欠落を解消する](tasks/2026-11-08_preserve-unresolved-osm-stations.md)

- `review`: [OSM再取込で欠落した9駅の原因を個別調査](tasks/2026-11-08_investigate-missing-osm-stations.md)

- `review`: [OSM取込の旅客ホーム対応を修正](tasks/2026-11-08_fix-osm-passenger-platform-matching.md)

- `review`: [東上線の旅客線路数不一致10駅を修正](tasks/2026-11-08_fix-tojo-station-tracks.md)

- `review`: [東上線・越生線の全旅客駅形状を監査](tasks/2026-11-08_audit-tojo-stations.md)

- `review`: [OSM東上線の車庫・留置線マップ](tasks/2026-11-08_tojo-depot-map.md)

- `review`: [操車基盤と試作ブランチを分離](tasks/2026-11-08_split-yard-prototype.md)

- `review`: [ベカソヴォで貨車の入換を動かす](tasks/2026-11-07_operate-bekasovo-yard.md)（新目的への移行）

- `review`: [OSM駅範囲の遠隔誤生成を横断修復する](tasks/2026-11-07_repair-imported-station-ranges.md)（Phase -1）

- `review`: [Бекасово I の遠隔停車範囲を修正する](tasks/2026-11-07_fix-bekasovo-i-station.md)（Phase -1）

- `review`: [ベカソヴォの巨大な構内停車場を分割する](tasks/2026-11-07_split-bekasovo-facilities.md)（Phase -1）

- `review`: [留置場の範囲へ分岐支障を反映する](tasks/2026-11-07_show-usable-stabling-ranges.md)（Phase -1）


| Status | Task | Epic |
|---|---|---|
| `review` | [停車場と線路へ運転上の区分を導入する](tasks/2026-11-06_introduce-operational-classification.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [OSMの鉄道データからマップを生成する](tasks/2026-11-05_import-osm-railway-data.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [転てつ器を一級の実体として導入する](tasks/2026-11-05_introduce-turnout-entity.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [大規模な運行計画レビューマップを用意する](tasks/2026-08-23_create-large-operation-planning-review-map.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [路線・系統・経路・運行・運用を再構築する](tasks/2026-08-16_structure-lines-service-systems-and-operations.md) | [Phase -1](epics/phase-minus-one.md) |
| `review` | [AI生成マップの確定前に接続状態を確認する](tasks/2026-08-13_inspect-ai-map-connectivity.md) | [Phase -1](epics/phase-minus-one.md) |

## 完了

- `done`: [池袋〜小川町の土休日ダイヤと設備を調査する](tasks/2026-11-10_research-tojo-holiday-timetable.md)（追加指示で近似再現用の資料整理として終了。厳密な全件照合は後続候補）

- `done`: [編成全体の留置範囲と分岐支障を検査する](tasks/2026-11-07_validate-stabling-placement.md)（Phase -1）

| Status | Task | Epic |
|---|---|---|
| `done` | [ベカソヴォ操車場を再現したマップを用意する](tasks/2026-11-03_create-bekasovo-yard-map.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [運行計画UIのレビューマップを用意する](tasks/2026-08-19_create-operation-planning-review-map.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [既設線路間の曲線接続位置をキーで調整する](tasks/2026-08-13_adjust-curve-connection-positions.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [既設線路間の接続曲線を二円弧へ置換する](tasks/2026-08-13_replace-existing-track-connector-with-biarc.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [接線適合な線路接続とトポロジー判定の実装](tasks/2026-08-13_tangent-valid-railway-connectivity.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [購入可能な車両・編成をゲーム状態へ統合し駅から運行する](tasks/2026-08-13_integrate-purchasable-fleet-and-scheduled-dispatch.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [AI生成マップの確定前に線路別最小半径を確認する](tasks/2026-08-13_inspect-ai-map-track-radii.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [ゲーム内時間を実装する](tasks/2026-08-11_simulation-clock.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [蒸気機関車運用テストマップを生成する](tasks/2026-08-11_steam-operations-test-map.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [明示的な保存操作だけでサーバー同期する](tasks/2026-08-11_explicit-save-server-sync.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [UIエリアの役割定義とナビゲーション構造](tasks/2026-08-10_ui-navigation-structure.md) | 横断 |
| `done` | [キーボード操作の全面拡張](tasks/2026-08-10_keyboard-driven-operations.md) | 横断 |
| `done` | [建設モードUI再設計](tasks/2026-08-10_construction-ui-redesign.md) | 横断 |
| `done` | [AI連携用APIのVite組み込み (agy実装)](tasks/2026-08-10_ai-api-integration.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [駅間経路探索と列車移動を試作](tasks/2026-08-09_route-and-train-movement-prototype.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [線路上の停車地点として駅を試作](tasks/2026-08-09_station-stop-point-prototype.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [線路接続構造と現行文書の安定化](tasks/2026-08-09_stabilize-track-topology-and-docs.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [一本以上の接続で束分岐を許可し重ねがけを拒否](tasks/2026-08-09_allow-partial-bundle-branch-and-reject-overlap.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [N/Mで線路群の接続対応を調整](tasks/2026-08-09_adjust-bundle-connection-with-nm.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [キーボード割当の一元管理](tasks/2026-08-09_centralize-keybindings.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [個別線路を実体にして線路群を再編可能にする](tasks/2026-08-09_independent-tracks-and-groups.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [名前付き複数セーブ](tasks/2026-08-09_named-save-slots.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [マップの保存と読込](tasks/2026-08-09_map-save-and-load.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [線路自体の描画改善](tasks/2026-08-09_track-canvas-rendering.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [参考作品に沿った単純な地図UI](tasks/2026-08-09_simplify-reference-game-ui.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [曲線生成を円弧チェーンへ置換](tasks/2026-08-09_replace-curve-with-arc-chain.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [曲線半径とカントのゲーム実装](tasks/2026-08-09_curve-radius-and-cant.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [車両個体・編成・列車の最小実装](tasks/2026-08-09_fleet-formations-and-trains.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [車両データと連結・ブレーキ互換性](tasks/2026-08-09_vehicle-data-and-connection-compatibility.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [法的状態データ領域の定義](tasks/2026-08-09_define-legal-data.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [軌道構成データのゲーム統合](tasks/2026-08-09_track-construction-data-integration.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [鉄路データ定義の再構築](tasks/2026-08-08_rebuild-track-data.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [複数線路間の個別接続](tasks/2026-08-08_individual-track-connections.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [N本の線路を同時敷設](tasks/2026-08-08_parallel-track-building.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [敷設中線路の終点吸着](tasks/2026-08-08_track-end-snapping.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [線路の延長操作と途中分岐](tasks/2026-08-08_track-extension-and-branching.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [曲線線路の敷設](tasks/2026-08-08_curved-track-building.md) | [Phase -1](epics/phase-minus-one.md) |
| `done` | [自由マップ線路敷設プロトタイプ](tasks/2026-08-08_free-map-track-building.md) | [Phase -1](epics/phase-minus-one.md) |

## 中止

| Status | Task | 後継 |
|---|---|---|
| `cancelled` | [路線・運行系統・運行経路・個別列車運行を分離して統合する](tasks/2026-08-13_structure-lines-services-routes-and-train-runs.md) | [路線・系統・経路・運行・運用を再構築する](tasks/2026-08-16_structure-lines-service-systems-and-operations.md) |
| `cancelled` | [最初の操作可能な鉄道プロトタイプ](tasks/2026-08-08_first-interactive-prototype.md) | [自由マップ線路敷設プロトタイプ](tasks/2026-08-08_free-map-track-building.md) |

## 今後の候補

- Phase -1の技術選定と開発環境構築
- 座標系と2D描画方式の比較
- 最小ゲーム状態と操作命令の設計

「今後の候補」は着手可能なTaskではない。着手時に目的と完了条件を定義したTask文書へ昇格する。
