---
md_class: status
feature: track-construction-data
updated: 2026-08-09
epic: epic-phase-minus-one
task: task-track-construction-data-integration
---

# 軌道構成データのゲーム統合

線路敷設時に、軌間、レール形式、軌道支持方式、路盤を選択できる。選択結果は各個別線路の`specification`へ永続IDとして保存される。同時敷設した線路も、線路群ではなく各線路がそれぞれ仕様を保持する。

```ts
interface TrackSpecification {
  gaugeId: string;
  railProfileId: string;
  supportSystemId: string;
  roadbedId: string;
}
```

カタログの正本は`data/track/`のYAMLである。ゲーム起動時にYAMLを読み込み、カタログ名、形式バージョン、ID重複、プリセット参照を検査する。

レール形式を変更すると、その`profileFamily`に対応する軌道支持方式だけがUIの候補になる。操作命令を直接実行した場合も同じ互換性検査を行い、不正な組み合わせを拒否する。路盤は軌道支持方式から独立して選択する。

軸重、速度、劣化、建設費の計算はまだ実装していない。

## 実装

- `src/data/trackCatalog.ts`: YAML読込、索引、参照・互換性検査
- `src/simulation/model.ts`: 線路状態への軌道構成追加
- `src/simulation/commands.ts`: 線路作成時の検査と保存
- `src/main.ts`: 選択UIと選択線路の構成表示
- `tests/trackCatalog.test.ts`: 読込、互換性、状態保存のテスト
