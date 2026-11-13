---
md_class: status
---

# Epic一覧

Epicは必要に応じて設ける機能群や実装目標の単位であり、フェーズを意味しない。現在の開発順序は[実装対象の順序](../planning/implementation-targets.md)を正本とする。

| Epic | 状態 | 概要 |
|---|---|---|
| [操車場実働化](yard-operations.md) | planned | 東上線MVPの次の実装対象。先行試作あり |
| [旧技術プロトタイプ](phase-minus-one.md) | review（履歴） | 旧構想の受入未確認事項を残す。新規作業の所属先ではない |

東上線MVPは池袋〜小川町の土休日一日分を対象とする。[作業順序と段階ごとの完了条件](../planning/tojo-holiday-implementation.md)を参照する。Epicの追加を着手の必須条件とはしない。

## 規則

- Epicは必要なときだけ作成する。すべてのTaskをEpicへ所属させる必要はない。
- 状態は`planned`、`active`、`review`、`done`、`cancelled`を使う。
- Epicの完了には受入条件と確認が必要である。
- 完了済みの記録は履歴として扱う。
