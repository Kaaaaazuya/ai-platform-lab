# Terraform

## ひとことで

インフラの構成をコードで書き、計画（plan）を確かめてから反映（apply）するツール。このリポジトリでは、同じコードを AWS Emulator と実AWSの両方に流す。

## このリポジトリでの役割

| 項目 | 内容 |
| --- | --- |
| モジュール | `terraform/modules/chat-store`（DynamoDB の会話履歴テーブルと S3 バケット。バケットは公開アクセスをすべて止める） |
| 環境 | `terraform/envs/local`（AWS Emulator 向け） |
| 実行 | `make tf-apply` |
| CI | fmt、validate、tflint。変数が設定されていればエミュレーターへの apply とスモークテスト |
| 関連ADR | [ADR-006](../adr/0006-iac-cicd.md) |

## 仕組み

### 基本の流れ

1. `terraform init`：provider（AWSと話すためのプラグイン）を取得する
2. `terraform plan`：今の状態（state）とコードを比べ、何を作る・変える・消すかを表示する
3. `terraform apply`：計画どおりに反映し、state を更新する

### 接続先の切り替え

provider のブロックには接続先を書かない。AWS SDK と同じ環境変数（`AWS_ENDPOINT_URL`、`AWS_CA_BUNDLE`、認証情報のファイルなど）で切り替える。エミュレーター向けには `scripts/emulator-env.sh` が設定する。

エミュレーター向けの provider には、次の設定を入れている。

| 設定 | 理由 |
| --- | --- |
| `skip_credentials_validation` | 認証情報の確認（STS）を飛ばす |
| `skip_requesting_account_id` | アカウントIDの問い合わせを飛ばす |
| `skip_metadata_api_check` | EC2のメタデータを見に行かない |
| `s3_use_path_style` | S3をバケット名のサブドメインではなく、パスで指定する |

### state の扱い

エミュレーターは止めると中身が消えるので、エミュレーター向けの state もローカルに置いて毎回捨てる。実AWS向け（M5で追加）は S3 バックエンドに置く予定だ。

## 動かして確かめる

```bash
make env   # 初回だけ
make up
make tf-apply
source scripts/emulator-env.sh && aws dynamodb describe-table --table-name ai-platform-lab-conversations
```

## 学ぶポイント

- module で部品を作り、環境ごとに組み合わせる構成
- plan の差分を PR でレビューする運用
- 同じコードを、接続先だけ変えて別の環境に流す考え方

## つまずきやすい点

- AWS provider が環境変数だけでエミュレーターにつながるかは未確認。つながらなければ provider の `endpoints` で上書きする
- エミュレーターで apply が通っても、IAMの正しさは保証されない（ADR-006）
- tflint の AWS 向けルールセットは、`tflint --init` でダウンロードする

## 参考資料

- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [TFLint](https://github.com/terraform-linters/tflint)
