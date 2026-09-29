# pdftoshokan-adguard

pdftoshokan.com 向けの AdGuard ユーザースクリプトです。

## 機能

- 外部ポップアップ・外部新規タブ広告をブロック
- 漫画ページから1クリックでPDFビューアへ遷移
- 必要な `decode.php` の処理は維持
- PDFビューアの巻変更時広告を回避
- pdftoshokan.com / サブドメイン内の正常な遷移は維持

## AdGuard 登録URL

```text
https://raw.githubusercontent.com/takeshi46/pdftoshokan-adguard/main/pdftoshokan.user.js
```

AdGuard Android では、**設定 → 拡張機能 → 拡張機能を追加する → URLから追加** で上記URLを登録します。

## 更新

スクリプトには `@updateURL` と `@downloadURL` を設定しています。GitHub上の `pdftoshokan.user.js` を更新し、バージョン番号を上げることで更新配布できます。

## 現在のバージョン

v1.4.1
