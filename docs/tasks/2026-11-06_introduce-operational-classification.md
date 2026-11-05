---
md_class: operation
id: task-introduce-operational-classification
type: task
created: 2026-11-06
status: review
owners: [claude]
epic: epic-phase-minus-one
relations:
  - design-operational-classification
  - task-import-osm-railway-data
---

# Task: 停車場と線路へ運転上の区分を導入する

## 目的

留置線・車両基地・操車場を表現し、旅客駅以外へも車両を配置できるようにする。
あわせて本線と側線を区別できるようにする。
設計は [停車場と線路の運転上の区分](../designs/operational-classification.md) を正本とする。

## 責任範囲

- `Station.kind`（駅・信号場・操車場・車両基地）
- `Track.kind`（本線・側線）
- `station.createRange` / `track.create` への種類指定、`station.setKind` / `track.setKind`
- 保存形式 version 13 と version 12 からの加算的移行、検証
- UIでの種類表示
- OSM取り込みで `service` タグから線路の区分を設定し、車両基地を作る
- 自動テスト

## 対象外

- 制限速度の導出（別Task）
- 種類ごとの運行上の扱いの差、進路・閉塞、検修能力

## チェックポイント

- [x] `Station.kind` と `Track.kind` を追加する。
- [x] 作成時に種類を指定でき、後から変更できる。
- [x] 保存形式 version 13 と version 12 からの移行を実装する。
- [x] 車両基地の停車地点へ編成を配置でき、同一線路へ複数編成を留置できる。
- [x] UIで種類が分かる。
- [x] OSM取り込みが `service` から区分を設定し、車両基地を作る。
- [x] 全テストと本番ビルドが成功する。
- [ ] ブラウザで人間確認する。

## 受入条件

1. 種類を指定して停車場・線路を作成でき、後から変更できる。
2. version 12 のセーブを読み込むと停車場は `station`、線路は `main` になる。
3. 車両基地の停車地点へ編成を配置でき、同一線路へ複数編成を留置できる。
4. OSM取り込みで側線が側線として入り、森林公園検修区が車両基地として現れる。

## 成果物

- `Station.kind`（`station` / `signal-box` / `yard` / `depot`）と `Track.kind`（`main` / `side`）
- `station.createRange` / `track.create` の `kind` 指定、`station.setKind` / `track.setKind`
- 保存形式 version 13 と version 12 からの加算的移行、検証
- 選択パネルでの種類表示
- 取り込みの Phase 4（留置線群からの車両基地生成）と `service` タグからの区分設定
- `tests/operationalClassification.test.ts`（5件）

## 検証結果

- `npm test`: 25ファイル、**210テスト**成功（区分5件を追加）。
- `npm run build`: 成功。
- **同一線路へ2編成を留置**できることをテストで確認した（車両基地の停車地点）。
- version 12 のセーブが停車場=駅、線路=本線として読み込めることを確認した。

### 東武東上線系統での取り込み結果

| 項目 | 値 |
|---|---|
| 線路 | 317（本線60 / **側線257**） |
| 延長 | 本線181.4 km / **側線65.1 km** |
| 転てつ器 | 420（失敗3） |
| 駅 | 50（停車地点139） |
| **車両基地** | **27箇所（停車地点177）** |
| 不正接続 | 0 |
| 曲線半径 | 最小97.5 m、中央771 m、50 m未満0本 |

最大の車両基地は**森林公園車両基地（停車地点56）**で、実物の森林公園検修区に当たる。
以下 和光市27（和光検車区）、北池袋10、川越市9、下板橋8 と続く。

### Overpass APIの落とし穴

`around.<集合>` は**way集合に対しては動かない**。
`way(r)->.core; way[...](around.core:600)` は常に0件を返していたため、
東武の構内線がまったく取得できていなかった（森林公園検修区の85本が丸ごと欠落）。

`node(w.core)->.cn;` でノード集合を作り `around.cn:600` とすれば正しく動く。
同じ範囲で 504 way → 794 way になった。

## 未確認事項・残作業

- ブラウザで種類表示と車両基地を人間確認する。
- **制限速度の導出は未着手**（別Task）。現状は側線を25 km/hで敷いているだけで、
  規格・曲線・区分から導出していない。
- 車両基地27箇所は、接続点でまとまらない群が分かれた結果であり、
  実際の施設より細かい（森林公園が3つに分かれている）。
- 側線のさらなる細分（留置線・引上線・仕分線）は持たない。
