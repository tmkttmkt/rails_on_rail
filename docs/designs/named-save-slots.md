---
md_class: history
id: design-named-save-slots
type: design
created: 2026-08-09
status: review
epic: epic-phase-minus-one
---

# Design: 名前付きセーブスロット

## 決定

- ブラウザ内へ複数の名前付きセーブを保存する。
- セーブ管理情報とゲーム状態を分離する。
- 各セーブは不変ID、表示名、作成日時、更新日時、`MapState`を持つ。
- 新規保存、上書き、名前変更、読込、削除、JSON書出を一つの管理画面で扱う。
- JSONファイルはメタデータと`MapState`を包むセーブファイル形式とする。
- 旧形式の生の`MapState` JSONは無名セーブとして読み込めるようにする。
- 既存の一件ブラウザ内保存があれば、最初の一覧読込時に名前付きスロットへ移行する。

```ts
interface SaveFile {
  formatVersion: 1;
  metadata: {
    name: string;
    createdAt: string;
    updatedAt: string;
  };
  state: MapState;
}
```

## 名前

名前は前後の空白を除き、1文字以上80文字以下とする。ファイル名に使えない文字はJSON内の名前としては保持し、書出時のファイル名だけ安全な文字へ置換する。
