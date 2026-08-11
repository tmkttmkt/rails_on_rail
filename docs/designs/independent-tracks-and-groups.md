---
md_class: history
id: design-independent-tracks-and-groups
type: design
created: 2026-08-09
status: review
epic: epic-phase-minus-one
---

# Design: 独立線路と変更可能な線路群

## 決定

- `Track`は一本の物理線路を表す。
- `TrackGroup`は複数の既存`Track` IDを順序付きで参照する。
- 一つの線路が所属できる物理的な線路群は最大一つとする。
- 線路は線路群に属さず単独で存在できる。
- 線路群の解体は線路を削除せず、束だけを削除する。
- 線路群から線路を外して残りが一本以下になった場合、束を自動解体する。
- 複数線路の同時敷設では独立した線路を生成し、二本以上なら自動的に線路群を作る。
- 線路群は操作・表示・一括管理の単位であり、線形や設備状態の正本ではない。

```ts
interface TrackGroup {
  id: string;
  name: string;
  trackIds: string[];
}
```

## 操作

- 選択線路から新しい束を作る。
- 単独線路を既存の束へ追加する。
- 選択線路を束から外す。
- 束を解体する。
- 線路を撤去した場合は所属する束からも除去する。

## 保存形式

ゲーム状態を`version: 2`へ更新し、`trackGroups`と`nextTrackGroupId`を追加する。旧version 1の線路群は、個別線路へ展開して移行する。
