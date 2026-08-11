---
md_class: operation
---

# Taskの作成方法

Taskは、作業の目的、境界、完了条件、結果を引き継ぐ履歴文書である。

## ファイル名

```text
YYYY-MM-DD_<kebab-case-slug>.md
```

状態や担当者は変化するため、ファイル名には含めない。

## テンプレート

```markdown
---
md_class: history
id: task-<slug>
type: task
created: YYYY-MM-DD
status: ready
owners:
  - <担当者>
relations: []
epic: epic-phase-<n> # 該当する場合。横断Taskでは省略可
---

# Task: タイトル

## 目的・背景

## 責任範囲

## 対象外

## 完了条件

- [ ] 条件

## 方針・判断

## 関連文書

## 検証方法

## 作業結果

## 検証結果

## 未確認事項・残作業

## 引き継ぎ
```

## 規則

- `id`はリポジトリ内で一意かつ変更しにくい名前にする。
- 対応するPhaseが明確な場合、`epic`にPhase Epic IDを指定する。横断Taskでは省略し、本文に関連Phaseを記載してよい。
- `status`は`ready`、`in-progress`、`review`、`done`、`cancelled`のいずれかとする。
- 完了条件は実装手段ではなく、確認可能な結果として書く。
- 完了後は原則として本文を書き換えない。訂正が必要なら後続Taskから参照する。
- Taskを追加または状態変更したら、同時に`docs/task-index.md`を更新する。
