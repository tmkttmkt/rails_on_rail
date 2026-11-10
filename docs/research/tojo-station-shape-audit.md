---
md_class: history
---

# 東上線・越生線 全46駅の形状監査（2026-11-08）

対象は `saves/osm-tobu-tojo-depots.json`。線路・駅の修正はしていない。

## 結果

全46駅132停車範囲を検査し、東武公式の構内図46駅分と旅客線路数を照合した。10駅で登録数が一致しない。比較するのは旅客扱いの物理的な線路数であり、乗降面の番号数ではない。寄居・越生は東武分を比較する。数の一致だけで正しい線路を選べているとは判定できない。

全範囲が180 m以下、うち110範囲が180 mである。200 m級編成を全長収める駅範囲がない。短い範囲は坂戸 track-130 の5.05 m、朝霞 track-287 の13.45 m、新河岸 track-308 の40.23 m。特に前二者は旅客駅の範囲として不適切である。新河岸も実ホーム端との再照合が必要である。

駅端座標と線路距離の誤差は0.01 m超なし、範囲内部の分岐横断もなし。この検査で線路形状全体の正確さ・現地の接続を保証するものではない。曲線や側線分類そのものは異常判定に使わない。中板橋・成増・ふじみ野等には側線分類でも正当な旅客線路がある。

## 原因

1. `scripts/import-osm-map.ts:53` は片側90 mを固定している。ホームの実形状・端点を駅範囲へ変換していない。
2. 同ファイル `nearPlatform` と `withPlatform` は駅から近い線路を選び、線路全体とホーム頂点の近接を使う。駅の局所的なホーム対応を保証せず、最寄り候補はホーム一致なしでも残す。ホーム候補がない場合は近傍線路へ戻る。他社線・非旅客線を含む余地がある。
3. `src/simulation/stationImportRange.ts` は分岐で切れた短い区間も採用する。`scripts/repair-imported-stations.ts` の修復対象はほぼ2 mの既知不具合であり、5 m・13 mは修復対象外である。
4. `scripts/generate-tojo-depot-map.ts` は既存旅客駅を継承した。留置線の幾何・到達検査は旅客駅の正確さを検証しない。前回の検証範囲が不足していた。
5. `src/simulation/model.ts` の駅は線路上の区間であり、島式・相対式のホーム本体や縁の対応を保持しない。`src/ui/renderer.ts` の駅表示も線路中心への帯描画である。登録線路を直すだけでは実際のホーム形状を完全には再現できない。

これは最新OSM取得の失敗とは別の問題であり、再取得だけでは解消しない。

## 全駅照合

公式図は調査日に公開されていた案内図。測量図ではなく、ホーム端の実寸や線路曲率の根拠には使えない。数の不一致は確認済みだが、除くべき個々の線路IDは実ホームとの対応付けが必要である。寄居・越生では他社の共用駅構内を東武の駅範囲と区別する必要がある。

|駅・公式資料|現在の登録線路|公式図の東武旅客線路|最短範囲 m|判定|
|---|---:|---:|---:|---|
|[池袋](https://www.tobu.co.jp/railway/guide/station/info/7105.html)|3|3|180.00|数は一致・実寸未確認|
|[北池袋](https://www.tobu.co.jp/railway/guide/station/info/7201.html)|2|2|180.00|数は一致・実寸未確認|
|[下板橋](https://www.tobu.co.jp/railway/guide/station/info/7202.html)|2|2|180.00|数は一致・実寸未確認|
|[大山](https://www.tobu.co.jp/railway/guide/station/info/7203.html)|2|2|180.00|数は一致・実寸未確認|
|[中板橋](https://www.tobu.co.jp/railway/guide/station/info/7204.html)|4|4|180.00|数は一致・実寸未確認|
|[ときわ台](https://www.tobu.co.jp/railway/guide/station/info/7205.html)|2|2|180.00|数は一致・実寸未確認|
|[上板橋](https://www.tobu.co.jp/railway/guide/station/info/7206.html)|4|4|175.67|数は一致・実寸未確認|
|[東武練馬](https://www.tobu.co.jp/railway/guide/station/info/7207.html)|2|2|180.00|数は一致・実寸未確認|
|[下赤塚](https://www.tobu.co.jp/railway/guide/station/info/7208.html)|2|2|180.00|数は一致・実寸未確認|
|[成増](https://www.tobu.co.jp/railway/guide/station/info/7209.html)|4|4|180.00|数は一致・実寸未確認|
|[和光市](https://www.tobu.co.jp/railway/guide/station/info/7304.html)|4|4|180.00|数は一致・実寸未確認|
|[朝霞](https://www.tobu.co.jp/railway/guide/station/info/7305.html)|5|4|13.45|数が不一致|
|[朝霞台](https://www.tobu.co.jp/railway/guide/station/info/7307.html)|4|4|180.00|数は一致・実寸未確認|
|[志木](https://www.tobu.co.jp/railway/guide/station/info/7308.html)|5|4|167.95|数が不一致|
|[柳瀬川](https://www.tobu.co.jp/railway/guide/station/info/7320.html)|2|2|180.00|数は一致・実寸未確認|
|[みずほ台](https://www.tobu.co.jp/railway/guide/station/info/7309.html)|2|2|180.00|数は一致・実寸未確認|
|[鶴瀬](https://www.tobu.co.jp/railway/guide/station/info/7310.html)|2|2|180.00|数は一致・実寸未確認|
|[ふじみ野](https://www.tobu.co.jp/railway/guide/station/info/7311.html)|4|4|180.00|数は一致・実寸未確認|
|[上福岡](https://www.tobu.co.jp/railway/guide/station/info/7312.html)|2|2|151.67|数は一致・実寸未確認|
|[新河岸](https://www.tobu.co.jp/railway/guide/station/info/7313.html)|4|2|40.23|数が不一致|
|[川越](https://www.tobu.co.jp/railway/guide/station/info/7315.html)|2|2|180.00|数は一致・実寸未確認|
|[川越市](https://www.tobu.co.jp/railway/guide/station/info/7316.html)|6|4|170.93|数が不一致|
|[霞ヶ関](https://www.tobu.co.jp/railway/guide/station/info/7401.html)|2|2|180.00|数は一致・実寸未確認|
|[鶴ヶ島](https://www.tobu.co.jp/railway/guide/station/info/7402.html)|2|2|180.00|数は一致・実寸未確認|
|[若葉](https://www.tobu.co.jp/railway/guide/station/info/7403.html)|2|2|180.00|数は一致・実寸未確認|
|[坂戸](https://www.tobu.co.jp/railway/guide/station/info/7404.html)|5|4|5.05|数が不一致|
|[北坂戸](https://www.tobu.co.jp/railway/guide/station/info/7406.html)|2|2|180.00|数は一致・実寸未確認|
|[高坂](https://www.tobu.co.jp/railway/guide/station/info/7407.html)|4|2|144.70|数が不一致|
|[東松山](https://www.tobu.co.jp/railway/guide/station/info/7408.html)|2|2|180.00|数は一致・実寸未確認|
|[森林公園](https://www.tobu.co.jp/railway/guide/station/info/7409.html)|5|4|128.18|数が不一致|
|[つきのわ](https://www.tobu.co.jp/railway/guide/station/info/7410.html)|2|2|180.00|数は一致・実寸未確認|
|[武蔵嵐山](https://www.tobu.co.jp/railway/guide/station/info/7501.html)|2|2|180.00|数は一致・実寸未確認|
|[小川町](https://www.tobu.co.jp/railway/guide/station/info/7504.html)|5|4|119.34|数が不一致|
|[東武竹沢](https://www.tobu.co.jp/railway/guide/station/info/7505.html)|2|2|180.00|数は一致・実寸未確認|
|[みなみ寄居](https://www.tobu.co.jp/railway/guide/station/info/7513.html)|1|1|180.00|数は一致・実寸未確認|
|[男衾](https://www.tobu.co.jp/railway/guide/station/info/7506.html)|2|2|180.00|数は一致・実寸未確認|
|[鉢形](https://www.tobu.co.jp/railway/guide/station/info/7507.html)|2|2|180.00|数は一致・実寸未確認|
|[玉淀](https://www.tobu.co.jp/railway/guide/station/info/7508.html)|1|1|180.00|数は一致・実寸未確認|
|[寄居](https://www.tobu.co.jp/railway/guide/station/info/7512.html)|9|2|157.97|数が不一致|
|[一本松](https://www.tobu.co.jp/railway/guide/station/info/8102.html)|2|2|158.40|数は一致・実寸未確認|
|[西大家](https://www.tobu.co.jp/railway/guide/station/info/8103.html)|1|1|180.00|数は一致・実寸未確認|
|[川角](https://www.tobu.co.jp/railway/guide/station/info/8104.html)|2|2|180.00|数は一致・実寸未確認|
|[武州長瀬](https://www.tobu.co.jp/railway/guide/station/info/8106.html)|2|2|180.00|数は一致・実寸未確認|
|[東毛呂](https://www.tobu.co.jp/railway/guide/station/info/8108.html)|2|2|180.00|数は一致・実寸未確認|
|[武州唐沢](https://www.tobu.co.jp/railway/guide/station/info/8109.html)|1|1|180.00|数は一致・実寸未確認|
|[越生](https://www.tobu.co.jp/railway/guide/station/info/8112.html)|3|2|168.42|数が不一致|

## 修正順序

1. 寄居・越生の事業者区別、坂戸・朝霞の極短範囲、新河岸の余分な範囲を優先して旅客線路と対応付ける。
2. 残る線路数不一致駅を公式図とOSMホーム形状で個別に確認する。線路自体を一律に消さず、旅客駅への所属を修正する。
3. 取込でホーム形状と線路の局所的な対応・端点を保存し、固定180 mを置き換える。OSMに必要情報がない駅は暫定値と明示し、公式図から長さを推定しない。
4. 全46駅で線路数・範囲長・編成長・分岐支障を再検査する。その後、駅表示をホーム本体の形状へ拡張するか判断する。

## 再現と成果物

`npm run audit:tojo-stations`。比較基準は `data/maps/tojo-platform-reference.json`、処理は `scripts/audit-tojo-stations.ts`。

- 全駅図: 開発サーバーの `/saves/osm-tojo-station-audit.html`（赤は現在の停車範囲、灰は配線。図番号は実際の番線ではない）。
- 数値: `saves/osm-tojo-station-audit.report`。OSM派生成果物はGit対象外。© OpenStreetMap contributors / ODbL。
- 元地図SHA-256: `68d4963af80bfea5daef08926742db93c8ad30dbe2922f976c029fee6c31ed3b`。監査前後で一致。
- この調査ではマップ・ゲーム実装の修正もコミットも行っていない。公式構内図との線路数照合と、生成済み状態の数値・描画の監査である。現地の最新状態・全番線の正確な対応・全長実測は未確認。

[Task](../tasks/2026-11-08_audit-tojo-stations.md) / [現在のマップ仕様](../features/tojo-depot-map.md)
