---
md_class: operation
id: task-keyboard-driven-operations
type: task
created: 2026-08-10
status: done
owners: []
relations:
  - design-keyboard-driven-operations
epic: ~
---

# Task: キーボード操作の全面拡張

## 目的・背景

現在のキーバインドは8個（敷設確定・戻す・取消・削除・接続調整4種）のみ。
シミュレーションゲームとして、マップ移動・ツール切替・モード切替・各種操作を
マウスを離さずにキーボードで完結できる状態を目指す。

設計方針は [Design: キーボード操作の全面拡張](../designs/keyboard-driven-operations.md) を参照。

## 責任範囲

- `keybindings.ts` のKeyAction型と KEY_BINDINGS の拡張
- `main.ts` の keydown ハンドラへ新キーの処理追加
- マップパン（WASD/矢印キー）の連続入力対応
- ズームショートカット
- ツール切替ショートカット
- モード切替ショートカット（実装済みモードのみ）
- グローバルショートカット（Ctrl+S など）

## 対象外

- キーバインドのユーザーカスタマイズUI
- ゲームパッド対応
- Undo/Redo の全操作履歴（別Task）

## 完了条件

- [ ] WASD/矢印キーでマップがスクロールする
- [ ] +/− でズームできる
- [ ] ツール切替ショートカットが機能する（建設モード内）
- [ ] モード切替ショートカットが機能する
- [ ] Ctrl+S でセーブダイアログが開く
- [ ] `npm run test` 成功
- [ ] `npm run build` 成功

## 検証方法

- `npm run test`
- `npm run build`
- マウスを置かずにキーボードのみで線路を敷設できることを確認
- テキスト入力欄でキーが誤作動しないことを確認
