# Userscripts

自分のAdGuard環境で使っているものなので広告関係の挙動は注意

## Google Play ブックス

Play ブックス用のスクリプトは、読み上げ対応のアプリ版 [takeshi46/PlayBook](https://github.com/takeshi46/PlayBook) に移しました。このリポジトリからは削除しています。

## PDF閲覧：広告遷移防止

`pdf.user.js` — v1.5.10

### 機能

- 外部ポップアップ・外部新規タブ広告をブロック
- 1クリックでPDFビューアへ遷移
- 必要な中間処理は維持
- PDFビューアの巻変更時広告を回避
- 正常な内部遷移は維持

### AdGuard 登録URL

```text
https://raw.githubusercontent.com/takeshi46/Userscripts/main/pdf.user.js
```

AdGuard Android では、**設定 → 拡張機能 → 拡張機能を追加する → URLから追加** で上記URLを登録します。

## 更新・インストール

AdGuard Windows版では「拡張機能 → 拡張機能を追加 → ファイルまたはURLからインポート」で追加できます。ChromeのAdGuardブラウザー拡張だけではUserscriptを実行できません。

`pdf.user.js` に `@updateURL` と `@downloadURL` を設定しています。GitHub上のスクリプトを更新し、バージョン番号を上げることで更新配布できます。

## 現在のバージョン

PDF: v1.5.10
