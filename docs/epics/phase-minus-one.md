---
md_class: history
id: epic-phase-minus-one
type: epic
phase: -1
status: active
created: 2026-08-08
---

# Epic: Phase -1 技術プロトタイプ

## 目的・背景

本格的なゲーム開発へ進む前に、Rails on Railの中核となる技術構成と開発方法が成立することを、小さな実装で確認する。

完成したゲームを作る段階ではない。駅と線路の編集、経路探索、列車移動、保存と読み込みを最小構成で通し、シミュレーションと表示の分離、地図操作、データ保存の基礎を検証する。

## 検証すること

- TypeScriptとViteによる開発環境が適切か
- 2D地図上で自由線形の線路と線路群を配置・編集できるか
- 線路上へ駅を配置・編集できるか
- 線路の端点・途中分岐を接続点として表現できるか
- 接続点を使って駅間経路を探索できるか
- 列車を探索された経路に沿って移動できるか
- 表示処理から独立したシミュレーションを実装できるか
- ゲーム状態をJSONとして保存・復元できるか
- 人間とAIが共通の操作命令を利用できる構造にできるか

後続の運行概念整理は[路線・系統・経路・運行・運用を再構築する](../tasks/2026-08-16_structure-lines-service-systems-and-operations.md)で追跡する。

## 責任範囲

- TypeScriptとViteを中心とする開発環境
- 2D平面上の線路編集
- 駅の配置と編集
- 線路群と接続点の表現
- 駅間経路探索と列車移動
- 車両・編成・列車モデルのUI非依存な事前検証
- シミュレーションと表示の分離
- JSONによる保存と復元
- UIとAIが共通利用できる操作命令
- 自動テストとAOTPによる文書指向の開発基盤

## 対象外

- 鉄道経営としての完成度
- 需要、収益、建設費、維持費
- 詳細な車両性能と鉄道規格
- ダイヤ、信号、閉塞
- 技術研究、社会変化、年代進行
- 完成版のUIと画像素材
- 大規模な地図と性能最適化

## 最小機能

### 地図と編集

- 2D地図または平面キャンバスの表示
- 地図の移動と拡大・縮小
- 線路の敷設と撤去
- 線路群の作成、再編、解体
- 線路の選択
- 線路上への駅設置、選択、改名、撤去

### 鉄道網

- 線路端点と途中分岐を接続点として保持
- 接続点から参加線路を双方向に参照
- 駅間の経路探索

### 車両準備

- 車両カタログ、連結器、ブレーキ互換性
- 運行会社形式、車両個体、編成、列車のUI非依存モデル
- 最小列車を探索経路に沿って移動

### 保存

- ゲーム状態のJSON出力
- JSONからのゲーム状態復元
- 保存形式のバージョン番号

## 技術構成案

- TypeScript
- Vite
- UIは必要になるまで特定のフレームワークへ強く依存しない
- 描画・地図ライブラリは小規模な比較実装を行って選定する
- テストには高速に実行できるTypeScript向けテスト環境を使用する

地図を現実の地理座標で扱うか、架空世界の平面座標で扱うかは、このEpicで比較して決定する。プロトタイプでは実装が単純な平面座標から開始してよいが、座標系へ直接依存するコードは地図層に閉じ込める。

## 構造

```text
ユーザーまたはAIの操作命令
              ↓
        シミュレーション
              ↓
          ゲーム状態
           ↙      ↘
        地図表示    UI表示
```

シミュレーションはDOM、描画ライブラリ、UIフレームワークへ依存させない。画面上のクリックもAIからの要求も、可能な限り同じ操作命令へ変換する。

現在の操作命令の概略を以下に示す。確定したインターフェースはDesignとソースコード仕様で定義する。

```ts
type GameCommand =
  | { type: "track.create"; geometry: "straight" | "curve"; points: Point[] }
  | { type: "track.delete"; trackId: string }
  | { type: "trackGroup.create"; trackIds: string[] }
  | { type: "trackGroup.dissolve"; groupId: string };
```

## 完了条件

- [ ] 新規取得した環境で開発サーバーとテストを起動できる
- [x] 自由線形の線路と線路群を配置・再編できる
- [x] 端点・途中分岐を独立した接続点として保存できる
- [x] 線路上へ駅を配置・編集し、保存できる
- [x] 接続された駅間の経路を探索できる
- [x] 列車が探索された経路に沿って移動する
- [x] ゲーム状態を保存し、同じ状態へ復元できる
- [x] シミュレーションの主要処理を画面なしで自動テストできる
- [x] UIと外部入力が共通の操作命令を利用できる
- [x] Task、Design、Feature、検証結果が実装と対応している
- [ ] Phase 0へ残す技術と破棄する検証コードが明示されている

## 関連文書

- [購入可能な車両・編成をゲーム状態へ統合し駅から運行する](../tasks/2026-08-13_integrate-purchasable-fleet-and-scheduled-dispatch.md) — done
- [AI生成マップの確定前に接続状態を確認する](../tasks/2026-08-13_inspect-ai-map-connectivity.md) — review
- [AI生成マップの確定前に線路別最小半径を確認する](../tasks/2026-08-13_inspect-ai-map-track-radii.md) — done

- [技術方針](../planning/technical-direction.md)
- [Task一覧](../task-index.md)

## 配下Task

- [`review` 既設線路間の曲線接続位置をキーで調整する](../tasks/2026-08-13_adjust-curve-connection-positions.md)
- [`review` 既設線路間の接続曲線を二円弧へ置換する](../tasks/2026-08-13_replace-existing-track-connector-with-biarc.md)
- [`review` ゲーム内時間を実装する](../tasks/2026-08-11_simulation-clock.md)
- [`review` 蒸気機関車運用テストマップを生成する](../tasks/2026-08-11_steam-operations-test-map.md)
- [`review` 明示的な保存操作だけでサーバー同期する](../tasks/2026-08-11_explicit-save-server-sync.md)
- [`active` AI連携用APIのVite組み込み (agy実装)](../tasks/2026-08-10_ai-api-integration.md)
- [`review` 駅間経路探索と列車移動を試作](../tasks/2026-08-09_route-and-train-movement-prototype.md)
- [`review` 線路上の停車地点として駅を試作](../tasks/2026-08-09_station-stop-point-prototype.md)
- [`review` 線路接続構造と現行文書の安定化](../tasks/2026-08-09_stabilize-track-topology-and-docs.md)
- [`review` 一本以上の接続で束分岐を許可し重ねがけを拒否](../tasks/2026-08-09_allow-partial-bundle-branch-and-reject-overlap.md)
- [`review` N/Mで線路群の接続対応を調整](../tasks/2026-08-09_adjust-bundle-connection-with-nm.md)
- [`review` キーボード割当の一元管理](../tasks/2026-08-09_centralize-keybindings.md)
- [`review` 個別線路を実体にして線路群を再編可能にする](../tasks/2026-08-09_independent-tracks-and-groups.md)
- [`review` 名前付き複数セーブ](../tasks/2026-08-09_named-save-slots.md)
- [`review` マップの保存と読込](../tasks/2026-08-09_map-save-and-load.md)
- [`review` 線路自体の描画改善](../tasks/2026-08-09_track-canvas-rendering.md)
- [`review` 参考作品に沿った単純な地図UI](../tasks/2026-08-09_simplify-reference-game-ui.md)
- [`review` 曲線生成を円弧チェーンへ置換](../tasks/2026-08-09_replace-curve-with-arc-chain.md)
- [`review` 曲線半径とカントのゲーム実装](../tasks/2026-08-09_curve-radius-and-cant.md)
- [`review` 車両個体・編成・列車の最小実装](../tasks/2026-08-09_fleet-formations-and-trains.md)
- [`review` 車両データと連結・ブレーキ互換性](../tasks/2026-08-09_vehicle-data-and-connection-compatibility.md)
- [`review` 法的状態データ領域の定義](../tasks/2026-08-09_define-legal-data.md)
- [`review` 軌道構成データのゲーム統合](../tasks/2026-08-09_track-construction-data-integration.md)
- [`review` 鉄路データ定義の再構築](../tasks/2026-08-08_rebuild-track-data.md)
- [`review` 複数線路間の個別接続](../tasks/2026-08-08_individual-track-connections.md)
- [`review` N本の線路を同時敷設](../tasks/2026-08-08_parallel-track-building.md)
- [`review` 敷設中線路の終点吸着](../tasks/2026-08-08_track-end-snapping.md)
- [`review` 線路の延長操作と途中分岐](../tasks/2026-08-08_track-extension-and-branching.md)
- [`review` 曲線線路の敷設](../tasks/2026-08-08_curved-track-building.md)
- [`review` 自由マップ線路敷設プロトタイプ](../tasks/2026-08-08_free-map-track-building.md)
- [`cancelled` 最初の操作可能な鉄道プロトタイプ](../tasks/2026-08-08_first-interactive-prototype.md)

## 受入確認

- 状態: 未確認
- 確認者: 未定
- 機械確認に加え、線路敷設、束接続、N/M調整をブラウザ上で人間が確認する。

## 未確認事項・残作業

- 現在は架空世界の平面座標を使用している。現実の地理座標への移行要否は未決定
- 2D描画ライブラリとUIフレームワークの選定
- Phase -1を構成するTaskへの分解

## Phase 0への引き継ぎ

このEpicで採用した構造を土台として、Phase 0では操作性、経路探索、列車移動、保存機能をゲームとして継続利用できる品質へ発展させる。

プロトタイプで得た知見は記録するが、検証用コードを無条件に製品コードとして残すことは前提としない。
