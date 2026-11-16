# ADR-006 IaCとCI/CDでの検証方式

ステータス: Accepted（2026-11-16）。アプリAPIはLambda（Node.js）に決定（ADR-011）

## コンテキスト

AWS EmulatorはCloudFormation、Terraform、CDKへの対応がサービスごとに異なる。ローカルと実AWSを同じコードで構築できるかが論点。アプリAPIをLambdaにするかコンテナにするかも決める。

## 選択肢

| 案 | 内容 | 長所 | 短所 |
| --- | --- | --- | --- |
| A | CDK（TypeScript） | GenUと同じ。SA Proの学習にも役立つ | Emulatorでの再現度はサービス次第 |
| B | Terraform | クラウドを跨いだ構成に広げやすい | Emulatorでの再現度はサービス次第 |
| C | ローカルはSDKスクリプトで作成し、IaCは実AWS用だけにする | 確実に動く | 構築手順が二重になる |

## 判断材料・確認すること

- [ ] Terraform AWS providerが、エミュレーターの書き出す環境変数（AWS\_ENDPOINT\_URL、AWS\_CA\_BUNDLEなど）だけで接続できるか確かめる。だめならproviderのendpointsをoverrideファイルで差し替える
- [ ] 使うリソース（Lambda、DynamoDB、S3、IAMロール）がエミュレーターにapplyできるか試す
- [ ] CIでエミュレーターを起動する方法を決める（LinuxパッケージかDocker）
- [ ] 実AWS段の認証をOIDCで組む（長期鍵をCIに置かない）
- [ ] Lambda（Node.js、レスポンスストリーミング）の実行がエミュレーターでどこまで動くか確かめる

## 決定

Terraformを採用し、CI/CDの中でAWS Emulatorと実AWSの2段で検証する。パイプラインの図はデザインドックの「検証戦略」にある。

1. **PRごと（AWS Emulator・無料）**：静的チェック（fmt、validate、tflint、trivy）→ エミュレーター起動 → terraform apply → 統合テストと評価ランナー → エミュレーター停止
2. **mainマージ後（実AWS・従量課金）**：terraform plan → 手動承認 → apply → スモークテスト → destroy

### 構成の決めごと

- Terraformコードは1つ。エミュレーターか実AWSかは、接続先の設定（環境変数かoverrideファイル）だけで切り替える
- エミュレーターは全サービスを1つのHTTPSエンドポイントで提供し、起動ごとに認証情報、config、CA証明書を書き出す。CIではそれを環境変数でTerraformに渡す
- エミュレーターのアカウントIDは000000000000で固定。エミュレーター向けのstateは毎回捨て、実AWS向けのstateはS3バックエンドに置く
- BedrockやBedrock Guardrailsなど実AWSでしか作れないリソースは別モジュールにし、エミュレーター段では対象外にする

### 受け入れること

- エミュレーターでapplyが通ってもIAMの正しさは保証されない。IAMは静的解析と実AWS段で確かめる
- リソースによってはエミュレーターでapplyが失敗する。失敗したものは記録し、実AWS段だけで扱う
- 実AWS段は従量課金なので、実行頻度と上限額はADR-007で決める
