---
md_class: history
id: task-replace-existing-track-connector-with-biarc
type: task
created: 2026-08-13
status: done
owners:
  - codex
relations:
  - design-circular-arc-track-building
  - design-track-horizontal-alignment
  - task-replace-curve-with-arc-chain
  - task-curve-radius-and-cant
epic: epic-phase-minus-one
---

# Task: 既設線路間の接続曲線を二円弧へ置換する

## 目的・背景

曲線線路の通常区間は一定半径の円弧だが、既設線路へ終点接続する最終区間だけは三次ベジェ曲線であり、一定半径を持たない。既設線路から別の既設線路へ接続すると局所半径が不安定になるため、接続曲線も半径を説明できる円弧の組合せへ統一する。

## 責任範囲

- 始端と終端の位置・接線を満たす二円弧接続
- 接続を構成する各曲線区間の有限な半径計算
- 通常の円弧チェーンとの統合
- 既設線路間接続の回帰テスト
- Design、Feature、Impl-noteの現在実装への同期

## 対象外

- クロソイドなどの正式な緩和曲線
- 曲率変化量を考慮した自動線形最適化
- 敷設後の線形編集
- 分岐器固有の線形

## 完了条件

- [x] 既設線路間の最終接続が三次ベジェ曲線を使用しない
- [x] 接続曲線が始端・終端の位置と接線を維持する
- [x] 接続を構成する各非直線区間で有限な半径を計算できる
- [x] 既設線路間接続の半径がサンプリング数で大きく変動しない
- [x] 関連テストと本番ビルドが成功する

## 方針・判断

両端の位置と接線から接線連続な接続点を求め、二つの円弧を接続するbiarc方式を使う。幾何的に直線となる場合は直線として扱い、解が得られない入力を可変曲率のベジェ曲線へ暗黙に戻さない。

## 関連文書

- [Phase -1 Epic](../epics/phase-minus-one.md)
- [円弧を連ねる曲線敷設Design](../designs/circular-arc-track-building.md)
- [水平線形Design](../designs/track-horizontal-alignment.md)
- [自由マップ線路敷設Feature](../features/free-map-track-building.md)
- [曲線半径Impl-note](../impl-notes/curve-radius-and-cant.md)

## 検証方法

- 二円弧の始端・接続点・終端における接線連続性
- 各円弧内の半径一定性
- サンプリング数を変えた半径の安定性
- `npm run test`
- `npm run build`

## 作業結果

- 終点接続用の三次ベジェ曲線をequal-distance biarcへ置き換えた。
- 両端の位置と接線を維持し、接線連続な二つの一定半径円弧を生成するようにした。
- 有限の二円弧解を得られない配置は、可変曲率曲線へ戻さずエラーにするようにした。
- 円弧ごとの半径一定性、サンプリング数に対する半径安定性、既設線路間接続時の工学値保存をテストした。
- Chromeで実操作した結果、終点確定直後だけポインター位置が同じ終点としてプレビューへ二重追加される問題を確認した。描画と半径表示の双方で同一点を追加しないよう修正した。
- Design、Feature、Impl-noteを現在実装へ更新した。

## 検証結果

- `npm run test`: 17ファイル、205件成功。未追跡`.claude/worktrees/`内の旧テストも探索対象となり重複実行された。
- `npm run test -- --run tests/map.test.ts`: 対象側51件成功。未追跡worktree側48件も重複実行された。
- `npm run build`: 成功。
- ブラウザ確認: 利用可能なブラウザ接続がなかったため未実施。
- Chrome確認: 既設直線2本の端点間を曲線接続し、プレビュー半径`R 445 m`を確認。初回は確定直後の重複終点で画面更新が止まる問題を再現した。修正後は3本目の曲線が正常に確定・描画され、接続形状と状態表示（3 tracks、25 points）を確認した。修正後に新しいコンソールエラーは発生していない。

## 未確認事項・残作業

- なし。2026-08-16にユーザー確認済みとして完了扱いにした。

## 最終確認

- 2026-08-16: ユーザーにより、既設線路間の接続形状・プレビュー・半径表示を確認済みとして承認された。
- 同日の全体検証で `npm test` は23ファイル・190件成功、`npm run build` も成功した。

## 引き継ぎ

`src/simulation/geometry.ts`の終端接続曲線と`tests/map.test.ts`の接続テストを確認する。
