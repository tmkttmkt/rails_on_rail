---
md_class: history
id: task-create-large-operation-planning-review-map
type: task
created: 2026-08-23
status: review
owners: [codex]
epic: epic-phase-minus-one
relations:
  - task-structure-lines-service-systems-and-operations
  - task-create-operation-planning-review-map
---

# Task: 大規模な運行計画レビューマップを用意する

## 目的

運行を先に独立作成し、路線・系統が運行を束ねる新モデルを、複数路線・複数系統・複数運行・複数運用を含む実用規模に近いマップで確認できるようにする。

## 生成内容

- 複線環状線、北部線、空港線、貨物線および留置線
- 7駅、22線路
- 4路線、6系統
- 8経路、9運行
- 複数路線に所属する運行、路線だけに直接所属する運行、未所属運行
- 通常運行、翌日越し貨物運行、2日越し試験運行
- 3運用、通常編成、日別差し替え、未割当運用
- 4編成と複数駅への配置

## 成果物

- `saves/large-operation-planning-review.json`
- `scripts/generate-large-operation-review-map.ts`
- `npm run generate:large-operation-review-map`

## 完了条件

- [x] ジェネレーターがエラーなく完了する。
- [x] 生成セーブを `parseSaveFile` で再読込できる。
- [x] 全テストと本番ビルドが成功する。
- [ ] ブラウザで各パネルと地図表示を人間確認する。

## 検証結果

- `npm run generate:large-operation-review-map`: 成功。
- 生成結果: v11、22線路、7駅、4路線、6系統、8経路、9運行、未所属運行1件、3運用、4編成。
- 生成直後の `parseSaveFile`: 成功。
- `npm test`: 23ファイル、191件成功。
- `npm run build`: TypeScript型検査・Vite本番ビルド成功。

## 未確認事項

- `大規模運行計画レビューマップ` をブラウザへ取り込み、地図表示と「運行→路線・系統への割当→運用」の操作感を確認する。
