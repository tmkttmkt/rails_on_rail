---
md_class: history
id: task-create-operation-planning-review-map
type: task
created: 2026-08-19
status: done
owners: [codex]
epic: epic-phase-minus-one
relations:
  - task-structure-lines-service-systems-and-operations
---

# Task: 運行計画UIのレビューマップを用意する

## 目的・背景

路線・系統・経路・運行・運用のUI確認を、空のマップから手作業で準備せず開始できるv11セーブを用意する。

## 生成内容

- 4駅と接続済みの4線路
- 青葉線・海浜線と各路線の系統
- 2路線を直通する下り経路と、その上り経路
- 朝の往復運行と2日越し時刻の試験運行
- 往復運行を順序付きで担当する運用と日別編成指定
- 始発駅へ正しく配置した編成と、不一致確認用に別駅へ配置した編成

## 成果物

- `saves/operation-planning-review.json`
- `scripts/generate-operation-review-map.ts`
- `npm run generate:operation-review-map`による再生成手順

## 検証結果

- 生成後に`parseSaveFile`でセーブ全体を再読込: 成功。
- 関連するヘッドレス受入テスト6ファイル19件: 成功。
- 全テスト23ファイル190件: 成功。
- TypeScript型検査およびVite本番ビルド: 成功。

## 未確認事項

- ブラウザでセーブを読み込み、初期表示と各パネルからの編集しやすさを人間が確認する。
