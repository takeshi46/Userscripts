# userscripts

AdGuardで使えるユーザースクリプト集です。

## Google Play ブックス：横書き・上下スクロール

`play-books-vertical.user.js` — v1.2.0

- 本文を横書きに変更し、ルビを保持
- 上端で前ページ、下端で次ページを追加
- ページの枠・余白をなくし、段落途中の分割を接続
- 前ページ追加時に読んでいる位置を維持

登録URL：

```text
https://raw.githubusercontent.com/takeshi46/userscripts/main/play-books-vertical.user.js
```

リーダーを再読み込みし、右上の「上下スクロール」を押すと開始します。「通常表示に戻す」で終了します。フローテキストの本文を横書きに変換します。画像として収録された文字は変換されません。

表示したページはメモリに保持します。長時間の読書で重くなった場合は一度通常表示に戻して再開してください。標準リーダーの読書位置は最後に読み込んだ位置へ進みます。

## PDF閲覧：広告遷移防止

`pdf.user.js` — v1.5.6

### 機能

- 外部ポップアップ・外部新規タブ広告をブロック
- 1クリックでPDFビューアへ遷移
- 必要な中間処理は維持
- PDFビューアの巻変更時広告を回避
- 正常な内部遷移は維持

### AdGuard 登録URL

```text
https://raw.githubusercontent.com/takeshi46/userscripts/main/pdf.user.js
```

AdGuard Android では、**設定 → 拡張機能 → 拡張機能を追加する → URLから追加** で上記URLを登録します。

## 更新・インストール

AdGuard Windows版では「拡張機能 → 拡張機能を追加 → ファイルまたはURLからインポート」で追加できます。ChromeのAdGuardブラウザー拡張だけではUserscriptを実行できません。

両スクリプトに `@updateURL` と `@downloadURL` を設定しています。GitHub上のスクリプトを更新し、バージョン番号を上げることで更新配布できます。

## 現在のバージョン

PDF: v1.5.6 / Play ブックス: v1.2.0

