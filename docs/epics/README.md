---
md_class: status
---

# Epic一覧

Rails on Railでは、開発段階の各PhaseをEpicとして扱う。Epicはその段階の目的、責任範囲、対象外、完了条件、受入状態を保持する。

| Epic | 状態 | 概要 |
|---|---|---|
| [Phase -1](phase-minus-one.md) | active | 技術プロトタイプ |
| Phase 0 | planned | 鉄道が動く |
| Phase 1 | planned | 鉄道経営の核 |
| Phase 2 | planned | 運行 |
| Phase 3 | planned | 鉄道工学 |
| Phase 4 | planned | 鉄道会社 |
| Phase 5 | planned | 社会と制度 |
| Phase 6 | planned | 鉄道史 |

将来Phaseの概要は[開発段階](../planning/development-stages.md)を構想資料とし、着手準備を始める時点で個別Epic文書を作って正本とする。

## 規則

- ゲーム機能の作業成果物は、原則として関係するEpicへ所属する。軽微な保守や横断的な開発基盤作業は例外としてよい。
- Epicの状態は`planned`、`active`、`review`、`done`、`cancelled`のいずれかとする。
- 原則として同時に`active`にするEpicは1つとする。
- Epic完了には、配下TaskだけでなくEpic自身の完了条件と受入確認が必要である。
- Epicを完了した後は履歴として凍結し、訂正は後続EpicまたはTaskから参照する。
