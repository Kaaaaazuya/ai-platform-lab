# AIゲートウェイ（Envoy AI Gateway / Agent Router）

## ひとことで

アプリとLLMの間に置く中継役。アプリは OpenAI 互換の1つのAPIだけを知っていればよく、どのモデルに送るか、失敗したらどうするか、どれだけ使ってよいかはゲートウェイが受け持つ。

## このリポジトリでの役割

| 項目 | 内容 |
| --- | --- |
| 製品 | Envoy AI Gateway（2026年に Agent Router へ改名）。CLIは `aigw` |
| 起動 | `aigw run`（スタンドアロンモード）をコンテナで動かす |
| ポート | 1975（OpenAI互換API、`/v1`）、1064（管理用） |
| 転送先 | ホストの Ollama（`host.docker.internal:11434`） |
| 関連ADR | [ADR-001](../adr/0001-local-llm.md)、[ADR-002](../adr/0002-ai-gateway.md) |

## 仕組み

### 構成

Envoy AI Gateway は、3つの層からなる。

- Envoy Proxy：高性能なL7プロキシ。実際の通信を中継する
- Envoy Gateway：Kubernetes の Gateway API で Envoy を設定する部品
- Envoy AI Gateway：その上に、LLM向けの機能（モデルの振り分け、トークン単位の制限、プロバイダーごとの形式変換）を足したもの

本来は Kubernetes の上で動かすが、`aigw run` を使うと Kubernetes なしで1プロセスとして動く。設定を書かなくても、環境変数 `OPENAI_BASE_URL` に転送先を入れれば、その先へ中継する。

### 主な機能

| 機能 | 内容 |
| --- | --- |
| OpenAI互換API | `/v1/chat/completions`、`/v1/embeddings` などを受ける |
| 振り分け | リクエストの `model` に応じて、Ollama や Bedrock などに送る |
| フォールバック | 送り先が失敗したら、別の送り先に切り替える |
| トークン単位のレート制限 | 回数ではなく、使ったトークン数で上限をかける |
| 観測 | GenAIメトリクス（トークン数、レイテンシ）と、OpenInference形式のトレースを出す |

### 観測の設定

compose.yaml で次の環境変数を渡している。

| 環境変数 | 意味 |
| --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | トレースとメトリクスの送り先（OTel Collector） |
| `OTEL_AIGW_REQUEST_HEADER_ATTRIBUTES` | リクエストヘッダーをspanの属性にする。`x-session-id` を会話IDとして載せている |
| `OPENINFERENCE_HIDE_OUTPUTS` | 生成結果の本文をspanに残さない（ADR-005） |
| `OPENINFERENCE_HIDE_EMBEDDINGS_VECTORS` | 埋め込みのベクトルをspanに残さない（大きいため） |

## 動かして確かめる

```bash
curl -s http://localhost:1975/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"qwen2.5:7b","messages":[{"role":"user","content":"こんにちは"}]}'
```

## 学ぶポイント

- 社内AI基盤でゲートウェイを置く理由（統制、観測、切り替え）
- リクエスト単位ではなく、トークン単位で利用量を制限する理由
- Kubernetes Gateway API の考え方（Gateway、HTTPRoute など）
- 二段構成（入口のゲートウェイと、モデルへの出口のゲートウェイ）のリファレンスアーキテクチャ

## つまずきやすい点

- 公式サイト（aigateway.envoyproxy.io）は改名に伴って移転中。情報はGitHubのリポジトリも合わせて見る
- `aigw run` は実験的な扱いで、Kubernetes版のすべての機能が使えるわけではない
- PIIマスクなどのガードレールは内蔵していない（ADR-005）

## 参考資料

- [aigw run（Envoy AI Gateway Docs）](https://aigateway.envoyproxy.io/docs/cli/aigwrun)
- [Envoy AI Gateway Reference Architecture](https://aigateway.envoyproxy.io/blog/envoy-ai-gateway-reference-architecture/)
- [Kubernetes Gateway API](https://gateway-api.sigs.k8s.io/)
- [OpenInference](https://github.com/Arize-ai/openinference)
