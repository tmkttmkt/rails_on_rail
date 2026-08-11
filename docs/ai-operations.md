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
