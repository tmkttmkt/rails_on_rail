---
md_class: operation
id: task-introduce-turnout-entity
type: task
created: 2026-11-05
status: review
owners: [claude]
epic: epic-phase-minus-one
relations:
  - design-turnout-model
  - design-track-junction-topology
  - research-osm-railway-import-feasibility
---

# Task: 転てつ器を一級の実体として導入する

## 目的

分岐側の線形を「与えられて検査するもの」から「番数から生成するもの」へ変える。
これにより接線連続性の制約を緩めずに分岐を扱えるようにし、OSM取り込みの
唯一の障害を解消する。あわせて、現行モデルに存在しない「転てつ器の番数」という
規格をゲームへ導入する。

設計は [転てつ器モデル](../designs/turnout-model.md) を正本とする。

## 責任範囲

- 転てつ器カタログ `data/track/turnouts.yaml` とその読み込み
- `Turnout` 実体と `MapState` への追加
- `turnout.create` / `turnout.delete` コマンドと分岐側線形の生成
- 保存形式 version 12 と version 11 からの移行、検証
- 自動テスト

## 対象外

- 経路探索・列車移動での分岐側制限速度の反映
- 転換時間、電動・手動、信号連動、コスト、保守
- 分岐器の専用描画
- 既存セーブの3分岐接続点からの自動推定
- OSM取り込み処理そのもの

## チェックポイント

- [x] `data/track/turnouts.yaml` を追加し `trackCatalog` から参照できる。
- [x] `Turnout` 型と `turnouts` / `nextTurnoutId` を `MapState` へ追加する。
- [x] `turnout.create` が接線連続な分岐側線路を生成し、接続点を作る。
- [x] `turnout.delete` が分岐側線路と接続点を整合的に削除する。
- [x] 保存形式 version 12 と version 11 からの加算的移行を実装する。
- [x] 生成された分岐が既存の接線検査とトポロジー診断を通る。
- [x] 全テストと本番ビルドが成功する。
- [ ] ブラウザで分岐の見え方を人間確認する。

## 受入条件

1. 線路上の任意の位置へ番数を指定して転てつ器を設置できる。
2. 生成された分岐側線路が、分岐点で基準線と接線連続である。
3. 番数が大きいほど分岐側の半径と制限速度が大きくなる。
4. version 11 のセーブを読み込み、保存・再読込後も同じ内容になる。
5. 転てつ器を削除すると分岐側線路と接続点が残らない。

## 成果物

- `data/track/turnouts.yaml`（8・10・12・16・18番の5形式）
- `src/data/trackCatalog.ts` の `TurnoutType` と `getTurnoutType`
- `src/simulation/model.ts` の `Turnout` / `turnouts` / `nextTurnoutId`、version 12
- `src/simulation/commands.ts` の `turnout.create` / `turnout.delete` と `buildDivergingPath`
- `src/simulation/persistence.ts` の `migrateVersion11` / `normalizeVersion12` と検証
- `tests/turnout.test.ts`（8件）
- `saves/turnout-sample.json` と `npm run generate:turnout-sample-map`

## 検証結果

- `npm test`: 24ファイル、**200テスト**成功（転てつ器8件を追加）。
- `npm run build`: TypeScript型検査・Vite本番ビルド成功。
- 生成された分岐側の最小曲線半径がカタログ値と一致することを確認した。

| 形式 | 番数 | 半径 | 制限速度 | 横距 | 縦距 |
|---|---|---|---|---|---|
| 8番 | 8 | 145 m | 25 km/h | 50.7 m | 715 m |
| 10番 | 10 | 245 m | 35 km/h | 41.0 m | 722 m |
| 12番 | 12 | 350 m | 45 km/h | 34.4 m | 728 m |
| 16番 | 16 | 660 m | 60 km/h | 26.2 m | 740 m |
| 18番 | 18 | 800 m | 70 km/h | 23.4 m | 744 m |

番数が小さいほど短い距離で大きく開き、大きいほど緩く開く関係が成立している。

- `inspectTrackRadii` のトポロジー診断: 不正接続0、孤立線路0。
- 既存セーブ（`bekasovo-yard.json` 290線路、`large-operation-planning-review.json`、
  `operation-planning-review.json`）がいずれも v11 から v12 へ移行し、
  `turnouts: []` を補って読み込めることを確認した。

### 既存テストへの影響

保存形式のバージョン更新に伴い、既存テストの `version` 期待値12件を11から12へ更新した。
あわせて次の2点を修正した。

- `migrateVersion10` が自前で `validateMapState` を呼び、v11で検証を終えていたため、
  `migrateVersion11` へ接続するよう変更した。
- `tests/persistenceV11.test.ts` の「v11の生JSON」を模す箇所が、
  `createInitialState` の更新により実際には v12 の状態を使っていたため、
  明示的に `version = 11` を設定するよう修正した。

## 後続の拡張（2026-11-05）

OSM取り込みの過程で、既存線路を分岐側に取れないことが接続欠落の主因だと
判明したため、設計の判断を訂正して次を追加した。詳細は
[転てつ器モデル](../designs/turnout-model.md) と
[OSM取り込み](2026-11-05_import-osm-railway-data.md) を参照する。

- `turnout.attach`: 既設線へ転てつ器を新設し、既存の線路を分岐側に取る
- `track.connect`: 継目。既存の2線路を端点どうしで接続する
- 転てつ器が受け持つ接続点では番数ぶんの角度変化を許容する検査へ変更
- 構内の急分岐のため6番分岐器をカタログへ追加

## 未確認事項・残作業

- ブラウザで `転てつ器見本` を読み込み、番数ごとの分岐の開き方を人間確認する。
- **転てつ器を設置するUIがない**。現状はコマンドとジェネレーター経由でのみ設置できる。
- 経路探索・列車移動で分岐側の制限速度が反映されない（設計上の対象外）。
- 転換時間、電動・手動、信号連動、コスト、保守は未実装（設計上の対象外）。
- カタログの半径・制限速度は暫定値であり、規格資料による裏付けがない（`status: draft`）。
- 既存セーブの3分岐接続点から `Turnout` を推定する処理は持たない。
  移行後も暗黙の分岐は転てつ器として記録されない。
