---
md_class: operation
---

# 法的状態データ

このディレクトリは、車両、軌道、運行、事業者に共通する法制度と法的状態の正本である。物理的な適合性、安全性、実際の運行能力とは分離する。

## カタログ

| ファイル | 内容 |
|---|---|
| [`regimes.yaml`](regimes.yaml) | 地域・時代ごとの法制度 |
| [`violation-types.yaml`](violation-types.yaml) | 違反となる行為・継続状態の種類 |
| [`exception-programs.yaml`](exception-programs.yaml) | 通常基準とは異なる方法・性能・設備を条件付きで認める正式な特例認可制度 |
| [`enforcement-policies.yaml`](enforcement-policies.yaml) | 当局の監視、裁量、黙認、処分傾向 |

現在の項目はゲーム構造を確認するための汎用`draft`であり、実在する国の法令内容を表さない。

## 3種類の判定

```text
実際の適法性
  └─ 規則へ適合しているか

発覚状態
  └─ 当局が違反を把握しているか

取締状態
  └─ 把握後に黙認、警告、処分など何を選んだか
```

未発覚と黙認を区別する。

- `hidden`: 違反を当局が把握していない
- `tolerated`: 違反を把握しているが、違法なまま処分していない
- `formally-exempted`: 有効な特例認可の範囲内で合法

## 保存データ

カタログは「何が違反か」「どの特例を申請できるか」を定義する。実際に発生した違反、認可、発覚、処分はゲームの保存状態へ記録する。

```yaml
violationCases:
  - id: violation-case-001
    violationTypeId: unauthorized-vehicle-modification
    subjectType: vehicle
    subjectId: vehicle-018
    occurredAt: "1932-06-10"
    resolvedAt: null
    discoveryStatus: detected
    enforcementResponse: tolerated
```

## 合法判定

```text
通常基準へ適合
  → 合法

通常基準には不適合だが、有効な特例の対象・期間・場所・条件内
  → 合法

当局が黙認
  → 違法だが未処分

当局が知らない
  → 違法かつ未発覚
```

特例条件から外れた運行は合法化されない。本線運行禁止の特例車両を本線へ入れた場合は、新しい違反として扱う。

## 特例認可の役割

特例認可は違反者を救済するためだけの制度ではない。通常基準とは異なる安全確保方法を審査し、技術革新、性能向上、既存設備の継続利用、地域事情への適応を合法にする前向きな制度として扱う。

```text
通常基準の範囲内
  → 通常認可

通常基準を超える性能、または通常とは異なる設備
  ＋ リスク評価
  ＋ 代替安全対策
  → 特例認可
```

想定する目的は次のとおり。

- `innovation`: 新技術の試験・導入
- `performance-enhancement`: 本線高速化などの性能向上
- `infrastructure-accommodation`: 踏切など既存設備との両立
- `service-continuity`: 廃線危機路線の運行継続
- `emergency`: 災害・交通途絶時の緊急対応

特例申請時点で違反が発生している必要はない。認可前に対象行為を始めた場合だけ、未認可運行などの違反が成立する。

特例の効果は、単純な規則免除ではなく、認可する逸脱、認可する性能、適用範囲、代替安全対策、監視・報告条件として記録する。

## 法的状態の初期語彙

### 実際の適法性

- `compliant`: 適合
- `noncompliant`: 不適合
- `exempted`: 有効な特例により適法

### 発覚状態

- `hidden`: 未発覚
- `suspected`: 疑われている
- `detected`: 発覚済み
- `investigated`: 調査中

### 取締対応

- `none`: 対応なし
- `overlooked`: 見なかったことにする
- `informally-warned`: 非公式警告
- `tolerated`: 黙認
- `correction-period`: 改善猶予
- `sanctioned`: 正式処分

### 特例申請

- `draft`: 申請準備中
- `submitted`: 申請済み
- `under-review`: 審査中
- `provisionally-approved`: 仮認可
- `approved`: 認可
- `rejected`: 不認可
- `expired`: 期限切れ
- `suspended`: 一時停止
- `revoked`: 取消
