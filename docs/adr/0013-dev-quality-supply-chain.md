# ADR-013 開発時の品質チェックとサプライチェーン対策

ステータス: Accepted（2026-11-16）

## コンテキスト

M3までは型チェックとテスト、`terraform fmt` しかなく、リンター、シークレットの検出、依存パッケージの対策がなかった。洗い出した結果は次のとおり。

- TypeScript（api・web）にリンター・フォーマッターがない。シェル、GitHub Actions、Dockerfile、Terraform（tflint）も検査していない
- シークレットのスキャンがコミット前にもCIにもない
- 依存パッケージ448個のうち3個が install スクリプトを持つ。CIが `npm ci || npm install` で、lockfile と食い違うと黙って再解決する。`npm audit` で38件（critical 2、high 4）
- GitHub Actions をタグで指定している。`latest` タグのイメージが4つある

## 選択肢

| 対象 | 候補 | 選んだもの |
| --- | --- | --- |
| TS のリンター・フォーマッター | Biome / ESLint＋Prettier / oxlint＋Prettier | Biome |
| シークレット | gitleaks / TruffleHog / GitHub の secret scanning だけ | gitleaks |
| npm の対策 | npm のまま固める / pnpm に移行 / npm＋Socket | npm のまま固める |
| コミット前のフック | lefthook / husky＋lint-staged / pre-commit | lefthook |

## 決定

**リンター・フォーマッター**

- Biome（`biome.json`）。推奨ルールに加え、React のルールと non-null assertion の禁止を有効にする。整形は幅120・ダブルクォート
- shellcheck（`scripts/*.sh`）、actionlint（ワークフロー）、hadolint（Dockerfile）、tflint（terraform と AWS のルールセット、`.tflint.hcl`）

**シークレット**

- gitleaks（`.gitleaks.toml`）。既定ルールを使い、例外は `.env.example` と compose.yaml の `${VAR:-既定値}` だけ
- コミット前に staged の差分を、CIで全履歴をスキャンする

**npm のサプライチェーン**

- `.npmrc` で `ignore-scripts=true`（install スクリプトを実行しない）と `save-exact=true`（バージョンを固定で書く）
- install スクリプトを持つパッケージは許可リスト（`scripts/check-install-scripts.mjs`）で管理し、増えたらCIで止める。今の3つ（esbuild、fsevents、protobufjs）は、スクリプトがなくてもビルドとテストが通ることを確かめた
- CIは `npm ci` だけを使う（lockfile と違えば失敗する）。`npm audit signatures` でレジストリの署名を、`npm audit --audit-level=high` で脆弱性を確かめる
- 脆弱性への対応として OpenTelemetry SDK を 0.301 系に、vitest を 5 系に上げた。推移的依存の rimraf は `overrides` で上げた。`npm audit` は0件
- Dependabot で npm、Actions、Docker、Terraform を週1回更新する。公開直後の版を避けるため cooldown（7日、メジャーは14日）を置く

**CI とコンテナ**

- GitHub Actions はコミットSHAで固定し、checkout は `persist-credentials: false` にする
- CIで取得するツール（gitleaks、actionlint、hadolint）は版と SHA-256 を固定する
- compose.yaml のイメージは `latest` をやめてタグで固定する。ドキュメントのビルドに使う Python パッケージも版を固定する（`docs/requirements.txt`）

**受け入れること**

- フックを有効にするには、各自で `brew install lefthook gitleaks shellcheck actionlint hadolint tflint` と `make hooks` が必要
- `ignore-scripts=true` のため、ネイティブビルドが必要なパッケージを入れるときは `npm rebuild <pkg>` を明示的に実行する
- MinIO（`cgr.dev/chainguard/minio`）は無料版が `latest` しか配布していないので固定していない
- イメージやTerraformの脆弱性スキャン（trivy など）はまだ入れていない

## 確認すること

- [ ] compose.yaml で固定したタグ（aigw `v1.2.1`、otel-collector `0.165.0`、otel-lgtm `0.41.0`、presidio `2.2.366`）がレジストリにあるか。タグの一覧はこの環境から確認できていない
- [ ] Dependabot が compose.yaml の `${VAR:-tag}` 形式を更新対象として認識するか
- [ ] trivy（イメージ・Terraform・Dockerfile）を入れるか
