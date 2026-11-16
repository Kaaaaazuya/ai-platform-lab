# セットアップ（MVP: M1＋M2）

Mac（Apple Silicon）で、ローカル基盤とRAGチャットを動かす手順。

## 前提

- Docker Desktop（メモリ割り当て 8GB 以上推奨）
- Node.js 22 以上
- [Ollama](https://ollama.com/)（ホストで動かす）
- Terraform 1.9 以上
- AWS Emulator の rpm（`infra/aws-emulator/` に置く。後述）

## 手順

```bash
# 1. 秘密情報を生成（.env はコミットしない）
make env

# 2. モデルを取得（チャット: qwen2.5:7b、埋め込み: bge-m3）
make models

# 3. AWS Emulator の rpm を infra/aws-emulator/ に置いてから起動
make up

# 4. DynamoDB / S3 を Terraform でエミュレーターに作る
make tf-apply

# 5. 題材ドキュメント（OpenTelemetry concepts）を取得して取り込む
make docs ingest

# 6. API と画面を起動（別ターミナル）
make api
make web
```

http://localhost:5173 を開いて質問する。回答の下の「トレース」リンクで、そのリクエストのLangfuseトレースが開く。

## ガードレールの確認（M3）

```bash
# ガードの判定だけを確かめる（Presidioが起動していれば併用）
make guard-check

# アプリAPI経由で流し、トレースIDを表示する
make guard-check-api
```

Langfuseで表示されたトレースを開き、`rag.guard.input` / `rag.guard.output` のspanで `guard.blocked`・`guard.pii.entities` を確認する。検出があったspanはレベルが WARNING になる。

## ポート

| サービス | URL |
| --- | --- |
| チャット画面 | http://localhost:5173 |
| アプリAPI | http://localhost:8787 |
| AIゲートウェイ（aigw） | http://localhost:1975/v1 |
| AWS Emulator | https://127.0.0.1:9297 |
| Langfuse | http://localhost:3000 |
| Grafana | http://localhost:3001 |
| Presidio（PII検出） | http://localhost:5002 |
| Postgres（pgvector） | localhost:5433 |

## まだ確かめていないこと

- Terraform の AWS provider が `AWS_ENDPOINT_URL` と `AWS_CA_BUNDLE` だけでエミュレーターにつながるか（つながらなければ provider の `endpoints` で上書きする）
- aigw が `traceparent` を引き継ぎ、アプリAPIのspanとLLM spanが1本のトレースになるか
- Langfuse で OpenInference 形式のspanが generation として表示されるか
- Presidioのイメージが arm64（Apple Silicon）で動くか（動かなければ `platform: linux/amd64` を付ける）
- AWS Emulator で API Gateway のストリーミング応答が再現されるか（MVPはローカルの `server.ts` で同じ処理を動かしている）
