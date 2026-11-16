# AWS Emulator

## ひとことで

AWSのサービスのAPIを手元のマシンで再現するツール。AWSが2026年11月に公開した。このリポジトリでは DynamoDB と S3 を、Terraform で作って使う。

## このリポジトリでの役割

| 項目 | 内容 |
| --- | --- |
| 起動 | `make up`（公式の Dockerfile を元にしたイメージ） |
| エンドポイント | `https://127.0.0.1:9297`（全サービスで1つ） |
| 使うサービス | DynamoDB（会話履歴）、S3（原文のドキュメント） |
| 接続の設定 | `scripts/emulator-env.sh` |
| 関連ADR | [ADR-006](../adr/0006-iac-cicd.md)、[ADR-007](../adr/0007-aws-budget.md) |

## 仕組み

### 1つのエンドポイント

すべてのサービスを、1つのHTTPSのエンドポイントで受ける。どのサービスへのリクエストかは、リクエストの中身（署名やヘッダー）で見分ける。

### 起動ごとに書き出すもの

起動すると、`~/.aws/emulator/<ポート>/` に次のファイルを書き出す。

| ファイル | 用途 |
| --- | --- |
| 認証情報（credentials） | SDK や Terraform がリクエストに署名するための鍵 |
| 設定（config） | リージョンなど |
| CA証明書（ca.pem） | エミュレーターのHTTPSを信頼するための証明書 |

`scripts/emulator-env.sh` は、これらのファイルを環境変数で SDK と Terraform に渡す。使う環境変数は `AWS_ENDPOINT_URL`、`AWS_CA_BUNDLE`、Node.js 向けの `NODE_EXTRA_CA_CERTS` など。

### 再現の度合い（Fidelity）

サービスごとに再現度が違う。公式のドキュメントにサービスごとの Fidelity が載っている。特に次の点は本物と違う。

- IAMのポリシーを評価しない。拒否されるべきリクエストも通る
- 状態はメモリに持つ。止めると消えるので、毎回作り直す
- スロットリングや障害は起きない

## 動かして確かめる

```bash
make env   # 初回だけ。.env がないと compose が起動しない
make up
source scripts/emulator-env.sh
aws dynamodb list-tables
aws s3 ls
```

## 学ぶポイント

- ローカルで確かめられることと、実AWSでしか確かめられないことの線引き（デザインドックの検証戦略）
- AWS SDK がエンドポイントと認証情報をどこから読むか（環境変数、設定ファイル）
- 自己署名の証明書を信頼させる方法

## つまずきやすい点

- Mac（Apple Silicon）では、公式の Dockerfile から arm64 のイメージを作る必要がある
- 起動ごとに認証情報と証明書が変わる。古い環境変数のまま使うと署名や TLS で失敗する
- API Gateway のストリーミングや Lambda の実行をどこまで再現するかは未確認

## 参考資料

- [AWS Emulatorを使用してローカルでAWSに対してアプリケーションをテストする（AWSブログ）](https://aws.amazon.com/jp/blogs/news/test-your-applications-against-aws-locally-with-aws-emulator/)
- [Fidelity in AWS Emulator](https://docs.aws.amazon.com/emulator/latest/userguide/fidelity.html)
