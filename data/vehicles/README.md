---
md_class: operation
---

# 車両データ

このディレクトリは、製造会社が提供する車両設計と、車両同士を接続する規格の正本である。プレイヤー会社が付ける形式名、車両番号、現在状態、個別改造はゲーム保存データで扱う。

## カタログ

| ファイル | 内容 |
|---|---|
| [`manufacturers.yaml`](manufacturers.yaml) | 車両製造会社 |
| [`coupler-systems.yaml`](coupler-systems.yaml) | 連結器方式と直接互換性 |
| [`brake-systems.yaml`](brake-systems.yaml) | 編成に貫通するブレーキ方式 |
| [`locomotives.yaml`](locomotives.yaml) | 他車の牽引を主目的とする機関車 |
| [`powered-cars.yaml`](powered-cars.yaml) | 自ら旅客・貨物を積載できる動力車 |
| [`coaches.yaml`](coaches.yaml) | 客車 |
| [`wagons.yaml`](wagons.yaml) | 貨車 |

車両ファイルの分類は編集上の入口であり、ゲーム内挙動を固定しない。自走、牽引、旅客、貨物の能力は各項目の`capabilities`から判断する。

## 設計と所有車両

```text
メーカー設計（このディレクトリ）
  ↓ 採用・仕様変更
運行会社形式（保存データ）
  ↓ 製造・購入
車両個体（保存データ）
```

## 軸と重量

軸重計算の正本は`runningGear.axleGroups`とする。同じ性質の軸をグループ化し、空車時と最大積載時の1軸当たり荷重を持つ。現在軸重は積載率に応じて直線補間する。

ホワイト式などは`displayNotations`へ表示用情報として記録し、軸重や走行可否の計算には使わない。

## 連結器とブレーキ

車両の前後端は別々の接続情報を持つ。

```yaml
connections:
  front:
    couplerSystemId: center-buffer-light
    throughBrakeSystemIds: [vacuum-automatic]
  rear:
    couplerSystemId: center-buffer-light
    throughBrakeSystemIds: [vacuum-automatic]
```

隣接車両では、一方の`rear`と他方の`front`を比較する。

- 連結器が直接互換でなければ機械的に連結できない
- 共通する`throughBrakeSystemIds`があれば貫通ブレーキが動作する
- 共通ブレーキがなくても、運用方針が許せば機械連結だけで運行できる
- 貫通ブレーキ必須の運用では、共通方式がなければ編成不適合とする

手ブレーキは車両単体の装備であり、貫通ブレーキ方式には含めない。

## 法的状態

メーカー設計は既定の法的分類を持てるが、実際の適法性、登録、検査、未認可改造、黙認、特例認可は[`data/legal/`](../legal/README.md)と保存データで扱う。
