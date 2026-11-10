---
md_class: operation
---

# 東上線OSM車庫マップの方針と出典

ユーザー指定はOSM基準。既存 `saves/osm-tobu-tojo.json` は317線路・420接続点を持つが、軌間が全て1435 mmで、最寄り旅客駅名による車庫名に誤りがある。元データ取得記録は[既存Task](../tasks/2026-11-05_import-osm-railway-data.md)にある。

- 東武公式の路線・駅一覧: https://www.tobu.co.jp/railway/guide/line/tojo_line.html
- OSMデータ: OpenStreetMap contributors / ODbL。取得または既存取込スナップショットを使用し、マップは `saves/osm-*.json` としてローカル生成する。
- 配線略図.net https://www.haisenryakuzu.net/documents/pr/tobu/tojo/ は2023年3月調査で、現時点の配線変更未反映を明記している。現物図の代わりや最新配線の保証には使わない。

元配線の位相と留置範囲を区別する。車庫入口・検修線・本線の渡り線まで一つの巨大な停車範囲にせず、分岐支障を除いた区間を登録する。留置可能長を検証し、200 m級編成が入らない線路を10両用と呼ばない。OSM平面データから実際の線路番号・信号・検査機能を断定しない。

軌間1067 mmの一次資料: 東武会社要覧2025 https://www.tobu.co.jp/pdf/corporation/book_all.pdf?202409= の線路表（東上本線・越生線）。Overpassの新規取得は502／タイムアウトとなったため、元ファイルSHA-256 `b2e9560dbe77a632e6a15d4aac70c8319aa53b129da6c234bd843fa8c51f1b2c` の既存取込を基準とした。

本体接続成分266本を採用。留置登録は本線以外の指定側線に限定し、ホーム範囲前後5 mと分岐支障を除く。旧工場の再稼働、最新工事の反映、現地の正式番線番号の推定はしない。生成時に各施設への有向経路（必要なら側線で1回反転）を検証し、到達未確認区間を除外する。
