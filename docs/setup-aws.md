# 実AWSの準備（M5）

ADR-007 で決めた検証専用アカウントを用意する手順。手作業は最初の1回だけで、あとは GitHub Actions から手動で動かす。

## 作るもの

| 種類 | 中身 | 作り方 |
| --- | --- | --- |
| アカウント | 検証専用のAWSアカウント（東京） | 手作業 |
| state | Terraform の state を置く S3 バケット | `terraform/bootstrap` |
| 入り方 | GitHub の OIDC プロバイダー、plan 用と apply 用のロール | `terraform/bootstrap` |
| 予算 | 月5ドル。50%・80%・100%でメール | `terraform/bootstrap` |
| 止める仕組み | 100%で、両ロールに Bedrock を拒否するポリシーを付ける | `terraform/bootstrap` |
| 承認 | GitHub の Environment（`aws-plan`、`aws-apply`） | 手作業 |

## 1. アカウントを作る

1. [AWS のサインアップ](https://portal.aws.amazon.com/billing/signup)で新しいアカウントを作る。メールは普段のアカウントと分ける。Gmail なら `+aws-lab` のような別名でもよい
2. ルートユーザーに MFA を付ける。ルートのアクセスキーは作らない
3. 請求の画面で「IAM ユーザーとロールによる請求情報へのアクセス」を有効にする
4. 普段使う IAM ユーザーを作る。`AdministratorAccess` を付け、MFA を設定する。アクセスキーは作らない

AWS Organizations の管理アカウントが既にあれば、メンバーアカウントとして作ってもよい。その場合は IAM Identity Center から入り、手順4の代わりに `aws configure sso` を使う。

## 2. 手元から入る

AWS CLI 2.32.0 以降の `aws login` で、コンソールのサインインから一時的な認証情報を得る。長く使える鍵を置かずに済む。

```bash
aws --version            # 2.32.0 以上
aws login --profile ai-lab
aws sts get-caller-identity --profile ai-lab
```

## 3. 常設のリソースを作る

```bash
cd terraform/bootstrap
cp terraform.tfvars.example terraform.tfvars   # 通知先のメールを書く
export AWS_PROFILE=ai-lab
terraform init
terraform plan
terraform apply
```

- Budgets から確認のメールが来たら承認する
- この構成の state はローカルの `terraform.tfstate` に残る。コミットはされないので、消さずに手元で保管する
- 出力の `plan_role_arn` と `apply_role_arn` は次の手順で使う

## 4. GitHub の Environment を作る

リポジトリの Settings → Environments で2つ作る。

| Environment | 承認者 | デプロイできるブランチ | 変数 |
| --- | --- | --- | --- |
| `aws-plan` | なし | `main` だけ | `AWS_ROLE_ARN` = `plan_role_arn` |
| `aws-apply` | 自分 | `main` だけ | `AWS_ROLE_ARN` = `apply_role_arn` |

- ロールの信頼ポリシーは、Environment 名で絞っている。ブランチを main に絞るのは、Environment の設定が受け持つ
- 公開リポジトリなので、承認者つきの Environment は無料で使える
- 自分で承認するので、「自分の承認を禁じる」設定は切ったままにする

## 5. 確かめる

ここまでで、課金が出るのは予算の通知くらいだ。M5のワークフローを作る前に、次を確かめておく。

- Budgets の画面に `ai-platform-lab-monthly` があり、アクションが1つ付いている
- IAM の画面に `ai-platform-lab-gha-plan` と `ai-platform-lab-gha-apply` がある
- Bedrock の画面で、東京の Guardrails が開ける

Bedrock のモデルは、今は最初から使える。昔の「モデルアクセス」の画面は2025年10月になくなった。Anthropic のモデルだけは、初回に用途を書くフォームを求められる場合がある。

## 権限の考え方

| ロール | 入れるところ | できること |
| --- | --- | --- |
| `gha-plan` | `aws-plan` | 読むだけ（`ReadOnlyAccess`）。state のロックファイルは書ける |
| `gha-apply` | `aws-apply` | state の読み書き、東京の Guardrails の作成と削除、モデルと Guardrails の呼び出し、タグの検索 |
| `budgets-action` | AWS Budgets | 上の2つに、Bedrock を拒否するポリシーを付け外しするだけ |

- 予算アクションで付いた拒否のポリシーは、自動では外れない。原因を確かめてから、Budgets の画面でアクションを戻す
- IAM のロールを作る権限は、まだ `gha-apply` に入れていない。M5で必要になったら、権限の境界（permissions boundary）つきで足す

## やめるとき

1. state のバケットは古い版も残す。全版を消してから、`terraform/bootstrap` で `terraform destroy` を流す
2. アカウントごと閉じる場合は、請求の画面から閉じる
