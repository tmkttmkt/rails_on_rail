---
md_class: history
id: task-rebuild-track-data
type: task
created: 2026-08-08
status: review
owners:
  - codex
relations:
  - design-track-data-format
  - research-railway-spec-categories
epic: epic-phase-minus-one
---

# Task: 鉄路データ定義の再構築

## 目的・背景

線路・車両・信号・保安装置を一つのプリセットへ混在させた旧`docs/data/`設計を廃止し、鉄路から段階的に定義できるデータ領域を作る。

## 責任範囲

- 旧`docs/data/`の削除
- ルート`data/`の新規構成
- YAMLとJSONの形式選定
- 鉄路、電力設備、信号・閉塞、列車保安装置の境界
- 鉄路カタログの初期雛形
- 新しい`data/README.md`

## 対象外

- 車両データ
- 史実値と工学値の確定
- JSON Schemaと自動検証コマンドの実装
- 信号・閉塞・保安装置の具体的なカタログ

## 完了条件

- [x] 旧`docs/data/`が削除されている
- [x] 新しい`data/README.md`が形式・境界・単位・ID規則を説明している
- [x] 鉄路に電化方式を含め、電力供給設備を分離している
- [x] 信号・閉塞と列車保安装置を鉄路から分離している
- [x] YAMLの曖昧な機能を制限する規則がある
- [x] 鉄路カタログの初期雛形が存在する

## 方針・判断

編集用の正本はYAMLとし、実行時JSONが必要な場合は検証済みYAMLから生成する。判断理由は[Design](../designs/track-data-format.md)を参照する。

## 関連文書

- [データ定義の入口](../../data/README.md)
- [鉄路データ](../../data/track/README.md)
- [旧カテゴリ調査](../research/railway-spec-categories.md)

## 検証方法

- YAML構文確認
- Markdownリンク確認
- 旧`docs/data/`と現在文書からの旧参照確認

## 作業結果

- 旧`docs/data/README.md`、`rails.md`、`vehicles.md`を削除した。
- `data/track/`へ軌間、レール、軌道構成、電化方式、プリセットのYAML雛形を作成した。
- `data/power-facilities/`、`signaling/`、`train-protection/`の責務をREADMEで定義した。
- YAML原本と将来のJSON Schema検証を組み合わせる方針を記録した。
- レビューを踏まえ、ゲームでの読み取りやすさと人間の理解を両立するため、英語camelCaseキーと日本語コメントの構成に確定した。
- 線路の法的状態と敷設形態を分離し、いずれかが変わる地点で線路セグメントを分割する原則を定義した。
- 軌道状態を軌道形状と軌道構造の健全度へ分け、動的荷重の増加と耐荷重の低下を別々に扱う方針を定義した。
- `researched`状態、共通出典カタログ、レール規格の地域分類を追加し、メートルトンの接尾辞を`T`へ統一した。
- 1600年頃から1900年頃までの歴史的レール24件を既存カタログへ統合し、地域、年代、材料、根拠区分を整理した。
- 超軽量・可搬・農業・殖民・産業鉄道向けの軽レール10件を追加した。
- 旧`track-components.yaml`を廃止し、締結・支持構造・道床を統合した軌道支持方式と、独立した路盤のカタログへ再構築した。

## 検証結果

- 5個のYAMLファイルをPyYAML `safe_load`で構文確認し、すべて成功した。
- Markdownリンク検査: リンク切れ0件
- `git diff --check`: 問題なし
- 現在仕様に残る旧JSON前提: 0件。旧Research内の記述だけは履歴として保持した。

## 未確認事項・残作業

- JSON Schemaと参照整合性検証を実装する。
- 各draft項目を一次資料または公的資料で検証する。
- 鉄路構成要素のフィールドをレビューする。
- 動的荷重の増幅式と軌道状態の補正式について、出典と適用範囲を確定する。

## 引き継ぎ

次は`data/track/`の各カタログについて、ゲームで必要な判定と史実の出典を一項目ずつ確定する。
