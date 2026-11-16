# ai-platform-lab

社内AI開発プラットフォーム（AIゲートウェイ・RAG・観測・改善ループ）を、AWS EmulatorとOSSでローカルに再現する個人学習用リポジトリ。

- デザインドックとADR: https://kaaaaazuya.github.io/ai-platform-lab/
- セットアップ手順: [docs/setup.md](docs/setup.md)
- 文章を書くとき: [docs/writing-guide.md](docs/writing-guide.md)

## 構成（M1〜M3）

| 役割 | 使うもの |
| --- | --- |
| AWS（DynamoDB・S3・Lambda） | AWS Emulator（Docker、`127.0.0.1:9297`） |
| AIゲートウェイ | Envoy AI Gateway（現 Agent Router）の `aigw run` |
| LLM | Ollama（ホスト）: `qwen2.5:7b` / 埋め込み `bge-m3` |
| ガードレール | Presidio＋日本向けルール（`app/api/src/guard.ts`） |
| ベクトルストア | pgvector |
| 観測 | OTel Collector → Grafana（otel-lgtm）と Langfuse |
| IaC | Terraform（エミュレーターと実AWSで同じコード） |
| アプリ | `app/api`（Node.js、Lambdaストリーミング対応）、`app/web`（Vite＋React） |

## クイックスタート

```bash
make hooks   # lefthook（要 brew install lefthook gitleaks ほか）
make env models up tf-apply docs ingest
make api   # 別ターミナル
make web   # 別ターミナル → http://localhost:5173
```

AWS Emulator の rpm は配布物をダウンロードして `infra/aws-emulator/` に置く（リポジトリには含めない）。

## ディレクトリ

```
app/api        RAGチャットAPI（server.ts: ローカル / handler.ts: Lambda）
app/web        チャット画面
infra/         Docker Compose で使う設定（emulator, postgres, otel）
terraform/     DynamoDB・S3（modules/chat-store, envs/local）
docs/          デザインドックとADR（GitHub Pages で公開）
scripts/       エミュレーター接続、題材ドキュメント取得
```

## ライセンス

題材の OpenTelemetry ドキュメントは CC BY 4.0（`data/docs/` は取得物のためコミットしない）。
