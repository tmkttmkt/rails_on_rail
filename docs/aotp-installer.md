---
md_class: operation
---

# AOTP導入・移行仕様

この文書は、AOTP v2を別プロジェクトへ安全に導入・更新・移行するための運用と、将来実装するinstaller CLIの契約を定義する。

現在のDenUniには文書管理CLIは存在するが、汎用installer CLIの`inspect / plan / apply / migrate`は未実装である。実装時はこの仕様を正本とする。

## 1. 目的と非目的

目的:

- 対象プロジェクトの構成を読み取り専用で調査する
- DenUni固有の前提を持ち込まずProject Profileを生成する
- 既存文書を破壊せずAOTP v2へ移行する
- 適用前に全変更と競合を提示する
- 同じ入力で繰り返し実行しても追加変更が発生しないようにする

非目的:

- `main / develop`等のブランチを勝手に作る
- API、DB、frontend、deploymentの存在を前提にする
- プロジェクトの機能仕様を自動決定する
- 人間にしか判断できない分類やテストを推測で確定する
- installerが自動でcommit、push、PR作成、deployを行う

## 2. 安全原則

- 既存ファイルを無断で上書き・削除しない
- `inspect`と`plan`はファイルを変更しない
- `apply`と`migrate`は明示的な実行指示を必要とする
- 既存のdirty worktreeでは原則適用せず、対象差分を分離する
- 不明事項は`unknown`として残し、確認なしに`true / false`へ変換しない
- 秘密情報、Cookie、実データ、ログ本文をplanへ含めない
- 適用後に検証が失敗した場合、完了扱いにしない
- 入口文書へ詳細規則を複製せず、正本へのリンクを追加する

## 3. 導入モード

| mode | 対象 | 動作 |
|---|---|---|
| `init` | AOTP未導入 | Profile、入口リンク、最小文書、管理CLIを追加 |
| `upgrade` | AOTP v2導入済み | Coreだけを更新しProject Profileと固有SKILLを保持 |
| `migrate` | 旧AOTPまたは独自docsあり | 分類、ID、status、リンク、ファイル名を移行 |
| `validate-only` | 変更不要 | 現在状態だけを検証 |

モードは検出結果から提案してよいが、既存ファイルの移動・削除を伴う場合は人間が確定する。

## 4. CLI契約

想定インターフェース:

```bash
python -m aotp inspect [path]
python -m aotp plan [path] [--mode init|upgrade|migrate]
python -m aotp apply [path] --plan <plan-file>
python -m aotp migrate [path] --plan <plan-file>
python -m aotp validate [path] [--strict]
```

### 共通オプション

| option | 意味 |
|---|---|
| `--root <path>` | 対象プロジェクトのルート |
| `--profile <path>` | Profile配置を明示。既定`.aotp/project.md` |
| `--format text|json` | 人間向けまたは機械向け出力 |
| `--non-interactive` | 質問せず、不明事項があれば停止 |
| `--strict` | warningも失敗扱い |
| `--force` | 個別に仕様で許可した競合だけ上書き。包括的な強制上書きは禁止 |

`--force`はdirty worktree、秘密情報、未解決分類、壊れたリンクを無視するために使ってはならない。

## 5. inspect

### 5.1 読み取り範囲

- `README`、入口文書、既存`docs/`
- Git branch、worktree、ignore設定
- package manifest、lockfile、requirements
- ソースディレクトリと設定ファイル
- testディレクトリ、CI workflow、既存テストスクリプト
- deploy設定のファイル名と方式
- `.agents`、`.claude`等の既存エージェント設定

秘密ファイルの本文は読まず、存在だけを扱う。`.env`、DB、セッション、Cookie、ログ、生成物は対象外とする。

### 5.2 検出結果

各項目は値だけでなく、確度と根拠を持つ。

```yaml
capabilities:
  api:
    value: true
    confidence: confirmed
    evidence:
      - back/routes
  database:
    value: unknown
    confidence: unknown
    evidence: []
```

確度:

- `confirmed`: manifest、コード、設定等で直接確認
- `inferred`: 命名や依存から推測。人間確認が必要
- `unknown`: 判断材料不足

### 5.3 テスト検出

テストごとに次を調べる。

- 種類: unit / integration / e2e / performance / security / manual
- 実行主体: agent / human / external-service
- 環境: local / CI / staging / production-like / physical-device
- コスト: low / medium / high / very-high
- 推定時間
- 資格情報、課金、破壊的操作の有無
- 実行手順の正本となる既存コマンドまたは文書

長時間テストや人間テストを、自動テストが存在しないものとして捨ててはならない。

### 5.4 inspectの禁止事項

- package install
- test実行
- network access
- branch作成
- ファイル生成・更新
- 外部サービスへのログイン

## 6. Project Profile生成

Profileは`.aotp/project.md`に置く運用MD。機械設定をYAML frontmatter、理由と関連リンクを本文へ書く。

```markdown
---
md_class: operation
aotp_version: 2
profile_version: 1
project:
  name: Example
documents:
  tasks: docs/tasks
  task_index: docs/task-index.md
  designs: docs/designs
git:
  implementation_base: main
  release_branch: main
  worktree_required: false
capabilities:
  api:
    enabled: false
  database:
    enabled: false
tests:
  unit:
    actor: agent
    environment: local
    cost: low
    procedure: test-local#unit
  device-check:
    actor: human
    environment: physical-device
    cost: high
    procedure: test-device
gates:
  quick:
    tests:
      - unit
  human:
    tests:
      - device-check
---

# Example Project Profile
```

Profileの責務:

- 文書タイプと配置
- Gitとworktree運用
- プロジェクト能力
- 利用可能なテストと実行主体
- gate構成
- 変更領域と必須文書・gateの対応

Profileへ置かないもの:

- 長いコマンド手順
- 個別Taskの結果
- APIやDBの現在仕様
- 実装判断の理由
- テスト実行結果

それぞれSKILL、Task、状況MD、Decisionへ分離する。

## 7. plan

`plan`はinspect結果と既存Profileを比較し、適用予定を一件ずつ出力する。

### 7.1 操作種別

| operation | 意味 |
|---|---|
| `create` | 新規ファイル作成 |
| `modify` | 既存ファイルの限定変更 |
| `move` | 安定ファイル名・新ディレクトリへ移動 |
| `metadata` | YAML frontmatterだけ変更 |
| `link-update` | 移動に伴うリンク更新 |
| `review` | 人間判断待ち。apply不可 |
| `delete` | 原則生成しない。明示的な廃止判断時のみ |

### 7.2 plan項目

```yaml
operations:
  - action: move
    source: docs/proposals/2025-01-01_done_login.md
    target: docs/tasks/2025-01-01_login.md
    reason: 実装済み旧ProposalをTaskへ移行
    confidence: confirmed
    body_change: false
    link_updates:
      - docs/designs/login.md
```

必須情報:

- 対象パス
- create / modify / move等の操作
- 変更理由
- 自動判定の確度
- 本文変更の有無
- 参照元とリンク更新先
- 競合または人間確認事項

### 7.3 競合分類

- `safe`: 新規作成または意味を変えないmetadata追加
- `merge-required`: 既存入口・規約との統合が必要
- `review-required`: 文書type、status、Task/Proposal判定が曖昧
- `blocked`: 同一ID、移動先重複、秘密情報混入、壊れた既存状態

`review-required`または`blocked`が1件でもあれば、non-interactive applyを禁止する。

### 7.4 planの保存

planは標準出力へ表示し、`--out`指定時は既定で`.aotp/install-plan.md`へ保存する。保存する場合は`md_class: status`、`type: installer-plan`を持つ状況MDとし、通常はcommitしない。

planは適用時の入力として固定し、生成後に対象ファイルが変化した場合は無効とする。各対象の内容hashを持ち、apply前に再確認する。apply完了後は削除するか、監査上必要な場合だけTaskの証拠へ移す。

## 8. apply

### 8.1 事前条件

- plan生成後に対象ファイルが変わっていない
- `review-required`と`blocked`が解消済み
- Git管理下なら専用branchまたはworktreeにいる
- 既存の無関係な未コミット差分と分離されている
- 移動先やIDが重複しない

### 8.2 適用順序

1. AOTP Coreの共通パーサーと検証器を配置
2. Project Profileを作成または更新
3. 新規ディレクトリ・文書を作成
4. YAML metadataを追加
5. ファイルをmove
6. Markdownリンクを更新
7. Task一覧等の生成物を再生成
8. validateを実行

パーサーと検証器を先に置くことで、途中状態も検査可能にする。

### 8.3 既存入口文書の扱い

AGENTS.mdやCLAUDE.mdが存在する場合、全文置換しない。次のリンクを不足分だけ追加する。

- Project Profile
- workflow
- Task一覧
- プロジェクト固有規約

同じ内容が別表現で存在する場合は自動重複させず`merge-required`にする。

### 8.4 apply後

installerはcommitしない。変更一覧と検証結果を出力し、利用者がdiffを確認してcommitする。

## 9. migrate

### 9.1 MD分類

候補判定:

- 規約、手順、入口、SKILL → `operation`
- Proposal、Task、Research、Design、Decision、Impl-note → `history`
- Feature、API、Schema、Reference、一覧 → `status`

複数分類に該当する文書は自動移行せず`review-required`にする。

### 9.2 旧Proposalの分離

- 実装済み、実装中、完了条件を持つ → Task候補
- 採否、比較、未決事項が中心 → Proposal候補
- 複数の独立作業を含む → Epicと子Taskへの分割候補

本文から確定できない場合は人間が選択する。

### 9.3 status変換

旧statusを文字列だけで機械変換せず、typeと実態を考慮する。

| old | Task | Proposal | Design | Research |
|---|---|---|---|---|
| draft | ready候補 | draft | draft | planned / researching候補 |
| active | in-progress候補 | review候補 | review候補 | researching |
| done | done候補 | accepted候補 | approved候補 | concluded |
| abandoned | cancelled候補 | rejected候補 | withdrawn候補 | superseded候補 |

`候補`は自動確定せず、本文や関連実装の根拠が必要。

### 9.4 安定ID

基本形式:

```text
<type>-<slug>
```

- 日付、担当、statusを含めない
- 同一IDが存在したら連番で回避せず、人間に意味の違いを確認する
- ID変更時は全relationsを同時更新する

### 9.5 ファイル名

```text
旧: YYYY-MM-DD_<status>_<slug>.md
新: YYYY-MM-DD_<slug>.md
```

move、本文Markdownリンク、YAML relations、Task一覧を同一planで更新する。

### 9.6 本文保持

過去の履歴MDは、次を除き本文を変更しない。

- 見出しのtype表記
- 移動に伴うリンク
- 旧metadataのYAML移動
- 明確な文字化けや壊れた参照の修正

変換前後の本文hashまたは正規化差分を記録し、想定外の本文変更を検出する。

### 9.7 過去Task

完了証拠を新形式で復元できない過去のdone Taskは、`legacy: true`を付けて検証免除できる。未完了Task、新規Task、再開Taskには使用しない。

## 10. validate

検証順序:

1. YAML構文
2. `md_class`と分類別必須項目
3. type固有status
4. ID一意性
5. relations解決
6. Markdownリンク
7. Task完了条件、Checkpoint、結果、gate
8. Profileのtest・gate参照
9. Task一覧等の生成物鮮度
10. 旧status入りファイル名の残存

プロジェクト固有gateの実行はinstallerの構造検証と分離する。installerは勝手に長時間テスト、外部サービス、人間テストを実行しない。

## 11. 冪等性

同じversion、Profile、対象内容で`plan`を再実行した場合、操作件数0になることを要件とする。

冪等性を壊す例:

- 実行ごとにIDへ連番を追加
- Task一覧の順序が不定
- 日付だけを毎回更新
- 入口リンクを重複追加
- YAMLキー順が実行ごとに変わる

生成物の`updated`は入力が変化した場合だけ更新する。

## 12. 失敗とロールバック

適用中に失敗した場合:

1. 以降の操作を停止
2. 成功済み操作と未実行操作を表示
3. validate結果を表示
4. Git差分を保持し、自動削除・自動resetしない
5. 利用者がdiffを確認して修正またはrevertする

Git管理外では、変更前内容を退避できない限りmove・modifyを禁止する。

## 13. 終了コード

| code | 意味 |
|---:|---|
| 0 | 成功、またはplanに変更なし |
| 1 | 検証失敗 |
| 2 | 人間入力・review待ち |
| 3 | 競合・dirty worktree・hash不一致 |
| 4 | 実行環境・依存関係不足 |
| 5 | 適用途中の失敗 |

機械利用時は標準出力をJSONにできるようにし、秘密情報を含めない。

## 14. 導入後の最小構成

```text
.aotp/project.md
AGENTS.mdまたはCLAUDE.md
docs/
  doc-format.md
  workflow.md
  task-index.md
  tasks/
  scripts/
    aotp_docs.py
    list-docs.py
    ledger.py
    check-docs.py
    check-links.py
    doc-status.py
```

Epic、Proposal、Research、Design、Decision、Impl-note、Feature、各種SKILLはProfileで必要なものだけ有効にする。

## 15. 導入後の確認コマンド

```bash
python docs/scripts/list-docs.py --all
python docs/scripts/list-docs.py --write-index
python docs/scripts/ledger.py --all
python docs/scripts/check-docs.py --strict
python docs/scripts/check-links.py
```

## 16. 更新

AOTP Core更新時はProject Profileとプロジェクト固有SKILLを保持する。

1. 現在の`aotp_version`と`profile_version`を読む
2. version間migrationをplanする
3. Core変更とProfile変更を分離表示する
4. Profileの新必須項目だけ人間へ確認する
5. apply後にvalidateする

古いCoreを新Profileで解釈できない場合は更新を停止し、対応versionを明示する。

## 関連

- [AOTP概念](aotp.md)
- [Taskの作成方法](tasks/README.md)
- [開発ワークフロー](workflow.md)
- [Rails on RailでのAOTP解釈](aotp.md#rails-on-railでの解釈)
