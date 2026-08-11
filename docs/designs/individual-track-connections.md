---
md_class: history
id: design-individual-track-connections
type: design
created: 2026-08-08
status: superseded
epic: epic-phase-minus-one
task: task-individual-track-connections
---

# Design: 複数線路間の個別接続

> 線路群本体と片方向接続を前提とする本方式は、[独立した線路と線路群](independent-tracks-and-groups.md)および[独立した線路接続点](track-junction-topology.md)へ置き換えられた。

## モデル

線路群`Track`へ個別線路`lanes`を持たせる。

```text
Track
  ├─ alignment: 中央線形
  ├─ lanes[]: 個別線路IDと位置番号
  ├─ startConnection
  └─ endConnection
```

接続情報は、接続先線路群IDと個別線路IDの組を保持する。

## 吸着

ポインターは個別線路へ反応するが、新線の線形は接続先線路群の中央線へ吸着する。これにより、同じ本数・間隔の線路群同士では全個別線路が一致する。

## 個別線路の対応

新線と既設線の本数が同じ場合は、左から同じ位置番号同士を接続する。

本数が異なる場合は中央寄せし、`min(新線本数, 既設本数)`本を対応させる。奇数と偶数の組み合わせでは左側を先に割り当てる決定的な規則を使う。将来、接続編集UIで変更可能にする。

## 現段階の制約

接続情報は新しく敷設した線路群側へ保持する。既設側の接続一覧は、全線路群を走査して逆参照する。分岐器形状はまだ生成しない。
