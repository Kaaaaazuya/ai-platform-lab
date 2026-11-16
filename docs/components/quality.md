# 品質チェックとサプライチェーン

## ひとことで

コードと文章の書き方、紛れ込んだ秘密情報、依存パッケージの安全を、コミットの前とCIで機械的に確かめる仕組み。

## このリポジトリでの役割

| 対象 | ツール | いつ動くか |
| --- | --- | --- |
| TypeScript・JSON・CSS | Biome | コミット前、CI |
| 人が読む文章（README、docs） | textlint | コミット前、CI |
| シェル | shellcheck | コミット前、CI |
| GitHub Actions | actionlint | コミット前、CI |
| Dockerfile | hadolint | コミット前、CI |
| Terraform | tflint | CI |
| 秘密情報 | gitleaks | コミット前（staged の差分）、CI（全履歴） |
| npm の依存 | `npm ci`、`npm audit`、`npm audit signatures`、install スクリプトの許可リスト | CI |
| 依存の更新 | Dependabot（cooldown 7日、種類ごとにまとめる。パッチは CI が通れば自動でマージ） | 月1回（すぐ届くセキュリティ修正は npm と pip だけ。ほかの脆弱性は見張っていない。ClickHouse と Redis は Langfuse に合わせて手で上げる） |

関連ADR：[ADR-013](../adr/0013-dev-quality-supply-chain.md)、文章の決まりは[文章ガイド](../writing-guide.md)

## 仕組み

### コミット前のフック（lefthook）

`make hooks` で有効にすると、`git commit` のたびに変更したファイルだけを検査する。Biome の整形は自動で直して、もう一度ステージに載せる。`git push` の前には型チェックとテストを流す。

### npm のサプライチェーン対策

| 対策 | 何を防ぐか |
| --- | --- |
| `.npmrc` の `ignore-scripts=true` | 依存パッケージの install スクリプトが勝手に動くこと |
| install スクリプトの許可リスト | スクリプトを持つパッケージが、知らないうちに増えること |
| CIは `npm ci` だけ | lockfile と違う版が黙って入ること |
| `npm audit signatures` | レジストリの署名がない、または合わないパッケージ |
| `npm audit --audit-level=high` | 既知の重大な脆弱性 |
| `save-exact=true` | 範囲指定（`^1.2.0`）で新しい版が自動で入ること |
| Dependabot の cooldown | 公開された直後の版を入れること（乗っ取られた直後の版である恐れがある） |

### CIとツールの固定

- GitHub Actions はタグではなくコミットSHAで指定する。タグは後から別のコミットに付け替えられるため
- CIでダウンロードするツール（gitleaks、actionlint、hadolint）は、版と SHA-256 を固定して検証する。AWS Emulator のパッケージ（リポジトリ変数のURLから取得）は例外で、まだ検証していない
- `actions/checkout` は `persist-credentials: false` にして、後の手順にトークンを残さない

## 学ぶポイント

- サプライチェーン攻撃の典型的な手口（アカウントの乗っ取り、install スクリプト、タグの付け替え）
- 「速く更新する」と「公開直後は待つ」のバランス
- 人がレビューで見落としやすいものを機械に任せる考え方

## つまずきやすい点

- `ignore-scripts=true` のため、ネイティブのビルドが要るパッケージは `npm rebuild <パッケージ名>` を明示的に実行する
- 新しく依存を足して install スクリプトの検査が失敗したら、スクリプトの中身を確かめてから許可リストに足す
- textlint は一文100文字を超えると失敗する。長い文は分ける

## 参考資料

- [Biome](https://biomejs.dev/)
- [gitleaks](https://github.com/gitleaks/gitleaks)
- [lefthook](https://github.com/evilmartians/lefthook)
- [npm: ignore-scripts](https://docs.npmjs.com/cli/v10/using-npm/config#ignore-scripts)
- [GitHub: Security hardening for GitHub Actions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions)
