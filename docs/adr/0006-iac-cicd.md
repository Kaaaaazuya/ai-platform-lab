# ADR-006 IaCとCI/CDでの検証方式

ステータス: Accepted（2026-11-16）。アプリAPIはLambda（Node.js）に決定（ADR-011）

## 要約

- インフラはTerraformで書き、同じコードをAWS Emulatorと実AWSの両方に流す
- PRごとにエミュレーターへapplyして確かめる。実AWSへは、手動で動かしたときだけ承認を挟んでapplyする（ADR-007）
- エミュレーターで確かめられないIAMなどは、静的解析と実AWS段で確かめる

## 背景

インフラをコードで管理する（IaC）と、構成をレビューでき、同じ環境を何度でも作り直せる。ただし、実AWSにapplyして確かめるには時間と費用がかかる。PRのたびに実AWSへapplyすると、学習用の予算ではすぐに足りなくなる。

AWS Emulator（[解説](../components/aws-emulator.md)）を使えば、PRごとに無料でapplyを試せる。問題は、エミュレーターの再現度がサービスごとに違うことだ。CloudFormation、Terraform、CDKへの対応度も異なる。そこで「どのIaCツールを使い、エミュレーターと実AWSをどう分担するか」を決める。あわせて、アプリAPIをLambdaにするかコンテナにするかも決める（ADR-011で Lambda に決定）。Terraformの詳細は[解説](../components/terraform.md)を参照。

## 検討した選択肢

### 案A：CDK（TypeScript）

- 長所：GenU と同じで、事例を読みながら進められる。AWS SA Pro の学習にもつながる
- 短所：CloudFormationを経由するので、エミュレーターでの再現度はCloudFormation対応次第になる
- 学べること：CDKのコンストラクト、CloudFormationのスタック

### 案B：Terraform

- 長所：AWS以外のクラウドやSaaSにも広げやすい。planで差分を確かめてからapplyする流れが分かりやすい
- 短所：エミュレーターでの再現度は、リソースごとに確かめる必要がある
- 学べること：provider、state、module、planとapplyの流れ

### 案C：ローカルはSDKスクリプト、IaCは実AWS用だけにする

- 長所：ローカルでは確実に動く
- 短所：構築手順が二重になる。ローカルと実AWSの差が広がる
- 学べること：少ない。差分を手で追う作業が増える

## 比較

| 観点 | 案A：CDK | 案B：Terraform | 案C：SDKスクリプト＋IaC |
| --- | --- | --- | --- |
| ローカルと実AWSを同じコードで扱えるか | 扱える | 扱える | 扱えない |
| エミュレーターへの依存 | CloudFormationの再現度 | リソースごとの再現度 | なし |
| 差分の見やすさ | cdk diff | terraform plan | なし |
| 他のクラウドへの広げやすさ | 低い | 高い | — |
| 実務での使われ方 | AWS中心の現場 | マルチクラウドの現場 | — |

## 決定

Terraformを採用し、CI/CDの中でAWS Emulatorと実AWSの2段で検証する。パイプラインの図はデザインドックの「検証戦略」にある。

1. **PRごと（AWS Emulator・無料）**：静的チェック → エミュレーター起動 → terraform apply → 統合テストと評価ランナー → エミュレーター停止。静的チェックは fmt、validate、tflint、trivy
2. **手動で動かしたとき（実AWS・従量課金）**：terraform plan → 手動承認 → apply → スモークテスト → destroy。mainへのマージごとには流さない（ADR-007）

### 構成の決めごと

- Terraformコードは1つ。エミュレーターか実AWSかは、接続先の設定（環境変数かoverrideファイル）だけで切り替える
- エミュレーターは全サービスを1つのHTTPSエンドポイントで提供し、起動ごとに認証情報、config、CA証明書を書き出す。CIではそれを環境変数でTerraformに渡す
- エミュレーターのアカウントIDは000000000000で固定。エミュレーター向けのstateは毎回捨て、実AWS向けのstateはS3バックエンドに置く
- BedrockやBedrock Guardrailsなど実AWSでしか作れないリソースは別モジュールにし、エミュレーター段では対象外にする

### 決定の理由

- 同じコードをエミュレーターと実AWSに流せるので、検証の段を分けても構成がずれない
- planの差分をPRで読めるので、レビューの練習になる
- 実務でもTerraformを使う場面が多い

### 影響

- ADR-007：実AWS段の実行頻度と上限額を決める必要がある
- ADR-011：アプリAPIをLambdaにしたので、Lambdaのapplyがエミュレーターで通るかが確認事項になる
- ADR-013：tflintとTerraformの静的チェックをCIに入れた

### 受け入れること

- エミュレーターでapplyが通ってもIAMの正しさは保証されない。IAMは静的解析と実AWS段で確かめる
- リソースによってはエミュレーターでapplyが失敗する。失敗したものは記録し、実AWS段だけで扱う
- 実AWS段は従量課金なので、実行頻度と上限額はADR-007で決める
