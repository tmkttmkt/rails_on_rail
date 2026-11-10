---
md_class: history
---

# 東上線の旅客線路所属補正（2026-11-08）

[全駅監査](tojo-station-shape-audit.md)の不一致10駅を修正した。既存OSMスナップショットのホーム形状を線路へ投影して目視照合し、公式構内図の物理的旅客線路数と照合した。元OSMは前の修復Taskに記載された一時保存先の `tojo4.json` と `platforms.json`。ホームwayは `geometry` を持つ。番線番号を推測して割り当てず、現在の線路IDによる明示的な所属設定とした。

|駅・公式図|残した線路ID（track-を省略）|駅から外した線路ID|判断|
|---|---|---|---|
|[朝霞](https://www.tobu.co.jp/railway/guide/station/info/7305.html)|1, 10, 60, 61|287|ホーム外の非電化構内線を除外|
|[志木](https://www.tobu.co.jp/railway/guide/station/info/7308.html)|1, 10, 61, 159|280|ホーム外の側線を除外|
|[新河岸](https://www.tobu.co.jp/railway/guide/station/info/7313.html)|1, 10|308, 310|島式ホームに面しない非電化構内線を除外|
|[川越市](https://www.tobu.co.jp/railway/guide/station/info/7316.html)|1, 10, 139, 261|143, 144|ホーム外の構内線を除外|
|[坂戸](https://www.tobu.co.jp/railway/guide/station/info/7404.html)|1, 5, 10, 284|130|ホーム外の5m断片を除外|
|[高坂](https://www.tobu.co.jp/railway/guide/station/info/7407.html)|1, 128|124, 125|島式ホームの外側の側線を除外|
|[森林公園](https://www.tobu.co.jp/railway/guide/station/info/7409.html)|1, 128, 237, 238|236|二つの島式ホームの外側の側線を除外|
|[小川町](https://www.tobu.co.jp/railway/guide/station/info/7504.html)|1, 165, 168, 171|164|二つの島式ホーム間の非ホーム線を除外|
|[寄居](https://www.tobu.co.jp/railway/guide/station/info/7512.html)|2, 295|7, 239, 241, 247, 249, 253, 317|東武ホーム2線のみ残し東武側線とJR秩父鉄道の線路を除外|
|[越生](https://www.tobu.co.jp/railway/guide/station/info/8112.html)|3, 260|259|東武島式ホーム外の側線を除外|

寄居の track-2 / track-295 が東武ホームの両側である。track-241 も東武だがホーム外の側線。track-7 / track-317 はJR八高線、track-239 / track-247 / track-249 / track-253 は秩父鉄道の線路である。元OSMの事業者タグとホーム位置を併用した。越生 track-259 は他社線ではなく東武のホーム外側線である。

小川町は二つの島式ホームに接する track-171 / track-1 と track-165 / track-168 を残し、その間の track-164 を駅範囲から外した。側線分類だけでの除外ではない。志木も四つの旅客線路を残し、その外側の track-280 のみ外した。

## 実装と検証

`data/maps/tojo-depots.yaml` に補正前・補正後の線路IDと理由を記録し、生成処理の留置範囲計算より前に適用する。入力SHA-256と補正前の線路集合を検証し、異なるスナップショットへ誤適用しない。全46駅の旅客線路数が参照値に一致しなければ生成を停止する。

旅客範囲132→113、削除19件。残した停車範囲の端点・長さは不変。線路266本、分岐接続点・転てつ器のデータは修正前後で一致。元入力のSHA-256も不変。車庫・留置施設11施設102区間を保持した。

副次的に川越市旧工場側線7区間への従来の到達検証が、誤所属だった側線を出発点にしていたことが判明した。正しい旅客ホームから反転1回以内の経路は確認できない。施設は `川越市構内側線（OSM・経路未確認）` と明記して幾何のみ保持する。到達確認済みは残り95区間。線路接続の追加や経路の捏造は行っていない。施設の現役使用も保証しない。

`npm run generate:tojo-depots`、`npm run audit:tojo-stations` 成功。全46駅の線路数不一致0、80 m未満の旅客範囲0、端点誤差0.01 m超0、範囲内部の分岐横断0。`npm run build` 成功、29ファイル238テスト成功。修正前はローカルの `.before-track-fix.bak` に保存した。

残作業は全駅のホーム端実寸化・ホーム本体の描画・川越市旧工場側線の経路調査である。全駅180 m以下という制約は継続する。監査HTMLは再生成後の現在状態であり、先の監査MDは修正前の記録として残す。

[修正Task](../tasks/2026-11-08_fix-tojo-station-tracks.md)

## 後続検証による訂正

小川町の選択に誤りがあったため、[取込器の再検証](osm-passenger-platform-matching.md)で track-164 を戻し track-168 を駅から外した。現在の設定はそちらを正とする。
