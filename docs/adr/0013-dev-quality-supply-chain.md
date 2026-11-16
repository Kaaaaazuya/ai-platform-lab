# ADR-013 開発時の品質チェックとサプライチェーン対策

ステータス: Accepted（2026-11-16）

## 要約

- リンターは Biome、文章は textlint、シークレットは gitleaks、フックは lefthook を使う
- npm は install スクリプトを止め、CIでは lockfile どおりにしか入れない
- GitHub Actions はコミットSHAで、CIで取得するツールはハッシュで固定する

## 背景

コードの品質とサプライチェーンの安全は、AIに実装を任せるほど重要になる（ADR-012）。人が気付かない書き方の崩れや、紛れ込んだ秘密情報、怪しい依存パッケージを機械で止める必要がある。

npmのサプライチェーン攻撃は、ここ数年で何度も起きている。人気パッケージの公開アカウントが乗っ取られ、install時に実行されるスクリプトから認証情報を盗む手口が典型だ。対策の要点は次の3つになる。

- 依存のinstallスクリプトを勝手に実行させない
- lockfileに書かれた版だけを入れ、黙って新しい版にしない
- 公開されたばかりの版はすぐに入れず、問題が見つかるまで少し待つ

詳しくは[品質チェックとサプライチェーンの解説](../components/quality.md)を参照。

## 洗い出した課題

M3までは型チェックとテスト、`terraform fmt` しかなく、リンター、シークレットの検出、依存パッケージの対策がなかった。洗い出した結果は次のとおり。

- TypeScript（api・web）にリンター・フォーマッターがない。シェル、GitHub Actions、Dockerfile、Terraform（tflint）も検査していない
- シークレットのスキャンがない（コミット前とCIの両方）
- 依存パッケージ448個のうち3個が install スクリプトを持つ。CIの `npm ci || npm install` は、lockfile がずれていると黙って再解決する。`npm audit` で38件（critical 2、high 4）
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
- シェルは shellcheck、ワークフローは actionlint、Dockerfile は hadolint で検査する
- Terraform は tflint で検査する。terraform と AWS のルールセットを使う（`.tflint.hcl`）

**人が読む文章**

- [文章ガイド](../writing-guide.md)を決め、textlint（ja-technical-writing のプリセットと表記辞書 `prh.yml`）で `README.md` と `docs/` を検査する（2026-11-16 追加）

**シークレット**

- gitleaks（`.gitleaks.toml`）。既定ルールを使い、例外は `.env.example` と compose.yaml の `${VAR:-既定値}` だけ
- コミット前に staged の差分を、CIで全履歴をスキャンする

**npm のサプライチェーン**

- `.npmrc` で `ignore-scripts=true`（install スクリプトを実行しない）と `save-exact=true`（バージョンを固定で書く）
- install スクリプトを持つパッケージは許可リスト（`scripts/check-install-scripts.mjs`）で管理し、増えたらCIで止める。今の3つ（esbuild、fsevents、protobufjs）は、スクリプトがなくてもビルドとテストが通ることを確かめた
- CIは `npm ci` だけを使う（lockfile と違えば失敗する）。`npm audit signatures` でレジストリの署名を、`npm audit --audit-level=high` で脆弱性を確かめる
- 脆弱性への対応として OpenTelemetry SDK を 0.301 系に、vitest を 5 系に上げた。推移的依存の rimraf は `overrides` で上げた。`npm audit` は0件
- Dependabot で npm、Actions、Docker、Terraform、pip を月1回更新する。公開直後の版を避けるため cooldown（7日、メジャーは14日）を置く（「Dependabotの運用」を参照）

**CI とコンテナ**

- GitHub Actions はコミットSHAで固定し、checkout は `persist-credentials: false` にする
- CIで取得するツール（gitleaks、actionlint、hadolint）は版と SHA-256 を固定する
- compose.yaml のイメージは `latest` をやめてタグで固定する。ドキュメントのビルドに使う Python パッケージも版を固定する（`docs/requirements.txt`）

**影響**

- ADR-006：CIにリンター、シークレット検出、サプライチェーンのジョブが加わった
- ADR-012：エージェントが作ったPRも、同じチェックを通る

**受け入れること**

- フックを有効にするには、各自でツールを入れて `make hooks` を実行する
    - `brew install lefthook gitleaks shellcheck actionlint hadolint tflint`
- `ignore-scripts=true` のため、ネイティブビルドが必要なパッケージを入れるときは `npm rebuild <pkg>` を明示的に実行する
- MinIO（`cgr.dev/chainguard/minio`）は無料版が `latest` しか配布していないので固定していない
- イメージやTerraformの脆弱性スキャン（trivy など）はまだ入れていない

## 確認すること

- [ ] compose.yaml で固定したタグがレジストリにあるか。タグの一覧はまだ確認できていない
    - aigw `v1.2.1`、otel-collector `0.165.0`、otel-lgtm `0.41.0`、presidio `2.2.366`
- [x] Dependabot が compose.yaml の `${VAR:-tag}` 形式を更新対象として認識するか → 認識しない。タグを直接書く形に改めた
- [ ] trivy（イメージ・Terraform・Dockerfile）を入れるか

## CIの実行の絞り込み（2026-11-17 追加）

ドキュメントだけのPRでも、TerraformやNode.jsのジョブがすべて動いていた。`npm ci` も3つのジョブで別々に実行していた。そこで次のように変えた。

- 最初の `changes` ジョブで変更されたファイルを調べ（`scripts/ci-changes.sh`）、関係するジョブだけを動かす。外部のActionは使わず、`git diff` で判定する
- CIの設定（`ci.yml` と `ci-changes.sh`）が変わったときと、比べる元のコミットがないときは、すべてのジョブを動かす
- 移動したファイルは元と先の両方の名前で判定する。日本語のファイル名もそのまま判定する
- シークレットの検出は軽いので、毎回すべての履歴を見る
- Node.jsの検査（サプライチェーン、Biome、型チェック、テスト、ビルド、評価の差分、textlint）を1つのジョブにまとめ、`npm ci` を1回にした
- ドキュメントサイトのビルド（`mkdocs build --strict`）を、マージの前にPRで確かめるようにした
- 同じPRへ続けてプッシュしたら、前の実行を取り消す。mainへのプッシュは実行ごとに別グループとし、待っている実行を後の実行で置き換えない
- 各ジョブに `timeout-minutes` を付け、止まったジョブが長く残らないようにした
- AWS Emulatorのジョブは、配布元のURL（リポジトリ変数）がなければジョブごと動かさない

| 変更したファイル | 動くジョブ |
| --- | --- |
| `app/`、`eval/`、`package*.json`、`biome.json`、`.npmrc` | node（サプライチェーンとコードの検査） |
| `docs/`、`README.md`、`mkdocs.yml`、textlintの設定 | node（textlint）、docs |
| `terraform/`、`.tflint.hcl`、エミュレーター接続のスクリプト | terraform-static、terraform-emulator |
| シェル、ワークフロー、Dockerfile | static（shellcheck、actionlint、hadolint） |
| どれでも | changes、secrets |

ブランチ保護で必須のチェックを決めるときは、飛ばされたジョブの結果が「skipped」として扱われる点を考える。必須にするなら、常に動く `changes` と `secrets` か、全ジョブの結果をまとめるジョブを用意する。

## Dependabotの運用（2026-11-17 追加）

### 見えた問題

- ライブラリ1つごとにPRが出ていた。Actions だけで4件あり、PRごとに CI と CodeRabbit が動く。CodeRabbit は1時間に10回までなので、まとめて来ると枠が足りなくなる
- compose.yaml で `${AIGW_IMAGE_TAG:-v1.2.1}` のように変数で書いたタグを、Dependabot は読めない。そのため主役の Agent Router、Presidio、OTel Collector、Grafana、Langfuse の更新は届かない。届いていたのは、Langfuse が中で使う ClickHouse と Redis の更新だけだった
- ClickHouse と Redis の版は、Langfuse の対応に合わせて決める。最新に上げると、Langfuse の起動に失敗する恐れがある
- ドキュメントのビルドに使う `docs/requirements.txt`（MkDocs など）は、更新の対象に入っていなかった

### 決めたこと

| 項目 | 前 | 後 |
| --- | --- | --- |
| 頻度 | 週1回 | 月1回（セキュリティ修正は頻度に関係なくすぐ届く。例外は下に書く） |
| まとめ方 | ライブラリごと（npm の一部だけまとめていた） | 種類ごとに、パッチ、マイナー、メジャーをそれぞれ1件 |
| マージ | すべて人が見る | パッチは CI が通れば自動でマージする。マイナーとメジャーは人が見る |
| compose のタグ | 変数で上書きできる書き方 | タグを直接書く。Dependabot が読める |
| ClickHouse と Redis | Dependabot が最新を出す | 対象から外し、Langfuse の対応に合わせて手で上げる |
| pip | 対象外 | 対象に入れる |
| 作り直し（rebase） | 既定 | 既定のまま |

作り直しは、既定のままにした。Dependabot は、main と競合したPRだけを作り直す。#14 のマージで多くのPRが作り直されたのは、どれも `ci.yml` を変えていて競合したからだ。作り直しを止めると、競合したPRを毎回手で直す手間が増える。PRをまとめてPRの数を減らす方が、効き目が大きい。

### 影響

- 頻度に関係なくすぐ届くセキュリティ修正（Dependabot security updates）は、npm と pip だけだ。ほかは、月1回の更新で新しい版に上がることはあるが、脆弱性を見張ってはいない（イメージや Terraform の脆弱性の検査は、まだ入れていない）
    - Docker、compose、Terraform は、GitHub がセキュリティ修正のPRに対応していない
    - Actions は、SHAで固定しているので、GitHub が脆弱性の通知（Dependabot alerts）を出さない
- 変数でタグを上書きする使い方はなくなる。別の版を試したいときは、compose.yaml を書き換えるか、`compose.override.yaml` を使う
- ClickHouse と Redis の更新は、Langfuse を上げるときに、Langfuse が出している compose の版と見比べて上げる
- Langfuse もパッチ版（`4.81.0` など）までタグに書く。`:4` のままだと、Dependabot はそれより細かい版を出さない。パッチ版の更新もPRで届き、ほかの依存と同じく自動でマージされる
- パッチの自動マージは `.github/workflows/dependabot-auto-merge.yml` で行う。ci が成功で終わったあとに動き、グループ名が `*-patch` のPRだけをマージする。PRのコードは取り出さず、CI の後にコミットが増えていればマージしない

