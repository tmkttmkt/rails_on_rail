---
md_class: status
---

# ベカソヴォの入換試験

## 起動

```sh
npm run generate:bekasovo-operation
npm run dev
```

既定の入力は `saves/osm-bekasovo-split.json`、出力は `saves/osm-bekasovo-operation.json`。入力は変更しない。OSM由来のローカルセーブはGit管理対象外である。分割版がない場合は、引数で元のベカソヴォOSMセーブを渡す。

```sh
npm run generate:bekasovo-operation -- saves/osm-bekasovo.json saves/osm-bekasovo-operation.json
```

1. セーブ管理で「ベカソヴォ (OSM・入換試験)」を読込む。
2. 上部の「操車」を開き「選択車両を地図中央へ」を押す。
3. 時間速度を60×または300×にして「仕分・出発計画を実行」を押す。1×ではゲーム内約34分かかる。
4. A方面3両を仕分線に残し、B方面3両を再連結した機関車が共通線へ引き出すと完了になる。
5. やり直すときは初期試験セーブを再読込む。途中保存は新規保存を使う。

画面の役割名は試験上の指定であり、実ベカソヴォの設備用途の断定ではない。車両は試験貨車6両と試験入換機1両。車長・速度・分岐保護距離は [試験設定](../../data/yard/prototype.yaml) に置く。

## 手動操作

車両列と移動先線路、先端の到着距離を選び経路探索・移動する。暗黙の折返しは行わず、停止後に反転する。解結両数は画面の一覧上部（後端）から数える。連結は「相手の後端まで接近」で停止させてから「接触した相手と連結」を押す。相手と向きが異なる場合は先に反転する。

手動操作は自動計画の次工程を止める。「計画を中断」は実行中の移動を完了させてから止まる。即時に止める場合は時間を一時停止し、「移動取消」を使う。加減速はモデル化しない。

## 状態と安全上の境界

- `MapState.yard` はversion 13への加算的な任意項目。旧セーブに必須項目を追加しない。
- UIとAIは `yard.deploy/move/reverse/split/couple/cancel/automatic` を `executeCommand` で利用する。時間は既存の `simulation.tick` に従う。
- 個体ID・長さ・動力・行先、車両順と複数線路上の占有、残移動経路、自動計画の進捗を保存する。
- 経路全体と他列の占有・先行予約が競合すれば待機する。分岐近傍も保守的に排他する。全経路を先に確保するため、部分的に前進できる場合も出発待ちになる。
- 自動計画は命令列であり、一般的な作業最適化ではない。今回の初期貨車順は方面ごとのまとまりを持つ。
- 車両はyard領域の試験個体で、既存fleetと相互転属できない。両者の同時配置・走行、および操車中の線路編集は拒否する。
- 重力ハンプ、信号連動、牽引力・制動距離、接続関係のない線路との車体干渉、継続的な貨物需要は未実装。分岐近傍の距離は実物の車両接触限界の保証ではない。

根拠: [入換処理](../../src/simulation/yard.ts)、[試験計画](../../src/simulation/yardScenario.ts)、[テスト](../../tests/yard.test.ts)。
関連: [Epic](../epics/yard-operations.md)、[Task](../tasks/2026-11-07_operate-bekasovo-yard.md)、[設計](../designs/bekasovo-yard-operations.md)。
