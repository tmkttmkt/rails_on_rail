---
md_class: history
id: design-parallel-track-building
type: design
created: 2026-08-08
status: active
epic: epic-phase-minus-one
task: task-parallel-track-building
---

# Design: N本の線路を同時敷設

## データモデル

1回の敷設で作る線路群を1つの`Track`として扱い、次を保持する。

- `trackCount`: 線路本数
- `trackSpacing`: 中心間隔のワールド距離
- `points`: 線路群中央の線形

線路ごとの運行や規格が必要になった段階で、線路群と個別線路のモデルを分離する。

## 平行線生成

描画用にサンプリングした中央線の各点で接線を求め、その法線方向へオフセットする。

```text
offset = (index - (count - 1) / 2) × spacing
```

奇数本では中央に1本、偶数本では中央を挟んで対称に配置される。描画、プレビュー、選択、吸着で同じ平行線生成処理を使う。

## UI

線形方式の下に本数入力を置き、1〜8本へ制限する。変更は敷設中のプレビューへ即時反映し、確定した線路群には影響しない。
