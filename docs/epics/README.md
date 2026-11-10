---
md_class: status
---

# Epic一覧

Epicは開発目的、責任範囲、対象外、完了条件、受入状態を保持する。**EpicとPhaseは同義ではない。** 現在の開発優先順位は当初のPhase番号ではなく、進行中Epicを基準とする。

| Epic | 状態 | 位置付け |
|---|---|---|
| [ベカソヴォ操車場実働化](yard-operations.md) | `active` | 現在の開発目標。入換・仕分・出発から処理能力比較まで |
| [Phase -1 技術プロトタイプ](phase-minus-one.md) | `review` | 旧構想の履歴。未確認条件を残し、新規開発の中心ではない |

旧Phase 0～6は[開発段階の記録](../planning/development-stages.md)に残す**未着手の構想**であり、着手が決定したEpicや、現在の予定工程を表すものではない。歴史・規格・経営の構想は廃止していない。

## 規則

- ゲーム機能の作業成果物は、原則として関係するEpicへ所属する。軽微な保守や横断的な開発基盤作業は例外としてよい。
- Epicの状態は`planned`、`active`、`review`、`done`、`cancelled`のいずれかとする。
- 原則として同時に`active`にするEpicは1つとする。
- Epic完了には、配下TaskだけでなくEpic自身の完了条件と受入確認が必要である。
- Epicを完了した後は履歴として凍結し、訂正は後続EpicまたはTaskから参照する。
