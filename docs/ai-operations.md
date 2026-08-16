---
md_class: operation
---

# AI向け 外部操作ガイド

## 概要

Rails on RailのVite開発サーバーは、外部AIとセーブJSONを交換するAPIを提供する。ブラウザは新規保存、上書き、JSON取込時だけサーバーへ送信し、定期的な状態送信やコマンド取得は行わない。外部AIはブラウザと独立してAPIを利用できる。

APIは開発サーバー専用であり、認証を持つ本番用サービスではない。

## セーブ一覧

```http
GET /api/server-saves
```

レスポンス例:

```json
[
  {
    "id": "1fd9c84c-62be-4e1d-9bf4-520a7303928c",
    "revision": 2,
    "filename": "1fd9c84c-62be-4e1d-9bf4-520a7303928c.json",
    "metadata": {
      "name": "北部幹線",
      "createdAt": "2026-08-11T00:00:00.000Z",
      "updatedAt": "2026-08-11T01:00:00.000Z"
    }
  }
]
```

既存の`*.json`はlegacyセーブとして一覧に含まれ、ファイル名がIDになる。

## セーブ取得

```http
GET /api/server-saves/:id
```

レスポンス本文は`SaveFile`である。`X-Save-Id`にID、`ETag`にrevisionが入る。legacyセーブはファイル名でも取得できる。

## 新規作成

### 確定前の線路半径確認

AIが生成したセーブを保存する前に、同じ`SaveFile`を検査APIへ送る。

```http
POST /api/server-saves/inspect
Content-Type: application/json
```

この操作はファイルを書き込まない。応答は各線路パーツの最小半径とマップ全体の最小半径を返す。

```json
{
  "tracks": [
    { "trackId": "track-1", "geometry": "straight", "minimumRadiusM": null },
    { "trackId": "track-2", "geometry": "curve", "minimumRadiusM": 312.5 }
  ],
  "minimumRadiusM": 312.5
}
```

実際の応答には`topology`も含まれる。

- `connectedComponents`: 接線方向が適合するjunctionで到達可能な線路パーツごとの配列
- `isolatedTrackIds`: 有効なjunctionを1つも持たない孤立線路
- `unconnectedEndpoints`: 接線適合junctionに接続されていない始端・終端。正常な行き止まりも含む
- `nearMisses`: 別の接続成分に属する他線路から2m以内なのに接続情報がない端点。接続漏れの強い候補
- `invalidConnections`: 接線方向が不連続（角度差 > 5度。直交90度交差など）な接続点詳細一覧（`junctionId`, `trackId1`, `location1`, `trackId2`, `location2`, `angleDifferenceDeg`）

### 線路敷設コマンドの接線制約

- 接続先線路ID（`startConnectionTrackId` / `endConnectionTrackId`）を指定した曲線敷設（`geometry: "curve"`）では、`startTangent` / `endTangent` が省略された場合でも接続位置の接線方向が自動適用され、両端でG1連続（滑らかな接続）な円弧が生成される。
- 直線敷設（`geometry: "straight"`）で接続先線路IDを指定する場合は、直線方向と接続先接線方向が連続（角度差 <= 5度）である必要がある。非連続な直線接続要求（直交交差など）はエラーとして拒否される。
- トポロジー診断および経路探索は、接線適合（角度差 <= 5度）な接続点のみを有効な接続として扱い、直交交差等の不連続接続点は通過不能な非接続状態として評価する。

未接続端は終端駅や留置線で正常な場合があるため、自動的な保存拒否には使わない。AIは孤立線路、`nearMisses`、`invalidConnections`を優先して確認してから保存する。

`minimumRadiusM: null`は直線、すなわち有限な最小半径がないことを表す。値はセーブ内の保存済み半径ではなく、線路点列から再計算される。内容を確認してから、次の作成または更新APIへ同じセーブを送る。`RailsAiClient`では`inspectSave(save)`を利用できる。

`SaveFile`を直接送信すると、サーバーがUUIDを発行する。

```http
POST /api/server-saves
Content-Type: application/json
```

```json
{
  "formatVersion": 1,
  "metadata": {
    "name": "AI生成マップ",
    "createdAt": "2026-08-11T00:00:00.000Z",
    "updatedAt": "2026-08-11T00:00:00.000Z"
  },
  "state": {
    "version": 8,
    "clock": {
      "currentTimeMs": -2208967200000,
      "paused": true,
      "speedMultiplier": 1
    },
    "tracks": [],
    "trackGroups": [],
    "junctions": [],
    "stations": [],
    "routes": [],
    "operatingTrains": [],
    "nextTrackId": 1,
    "nextTrackGroupId": 1,
    "nextJunctionId": 1,
    "nextStationId": 1,
    "nextRouteId": 1,
    "nextOperatingTrainId": 1
  }
}
```

成功時は`id`、`revision`、`filename`を返す。

## 更新と競合検出

既存セーブを更新するときは同期エンベロープを送る。

```json
{
  "saveId": "1fd9c84c-62be-4e1d-9bf4-520a7303928c",
  "expectedRevision": 2,
  "save": {
    "formatVersion": 1,
    "metadata": {
      "name": "北部幹線",
      "createdAt": "2026-08-11T00:00:00.000Z",
      "updatedAt": "2026-08-11T02:00:00.000Z"
    },
    "state": { "version": 8, "clock": { "currentTimeMs": -2208967200000, "paused": true, "speedMultiplier": 1 } }
  }
}
```

`expectedRevision`が現在値と異なる場合は`409 Conflict`を返し、既存JSONを上書きしない。AIは最新セーブを取得して再編集するか、新規セーブとして保存する。

## 保存形式

正本は[`src/simulation/persistence.ts`](../src/simulation/persistence.ts)の`SaveFile`と`MapState`である。サーバーは外枠と基本versionを検査する。ブラウザへ取り込むJSONは、必ず`parseSaveFile`による完全なゲーム状態検証を通す。
