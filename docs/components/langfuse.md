# Langfuse

## ひとことで

LLMアプリの観測と改善のためのOSS。トレース、評価スコア、プロンプトの管理、評価データセットと実験を1か所で扱う。

## このリポジトリでの役割

| 項目 | 内容 |
| --- | --- |
| 版 | v4（セルフホスト） |
| 画面 | http://localhost:3000（プロジェクトID `rag-chat`） |
| 部品 | langfuse-web、langfuse-worker、Postgres、ClickHouse、Redis、MinIO |
| 受信 | OTLP（`/api/public/otel`）。OTel Collector から届く |
| 関連ADR | [ADR-004](../adr/0004-observability.md)、[ADR-008](../adr/0008-evaluation.md) |

## 仕組み

### 構成

| 部品 | 役割 |
| --- | --- |
| langfuse-web | 画面と API |
| langfuse-worker | 受け取ったデータを非同期で処理して書き込む |
| Postgres | ユーザー、プロジェクト、プロンプト、データセットなどの設定系データ |
| ClickHouse | トレース、span、スコアなどの大量のデータ（列指向のデータベース） |
| Redis | 処理待ちのキューとキャッシュ |
| MinIO（S3互換） | 受け取ったイベントの原本 |

最初の起動時に、環境変数（`LANGFUSE_INIT_*`）でユーザー、組織、プロジェクト、APIキーを作る。`make env` が鍵をランダムに作って `.env` に書く。

### OTelとの関係

Langfuse は OTLP でspanを受け取り、OTelのトレースIDをそのまま使う。そのため、Grafana で見つけたトレースと同じIDで Langfuse のトレースを開ける。spanの属性から、Langfuse の項目を組み立てる。

| span の属性 | Langfuse での意味 |
| --- | --- |
| `langfuse.trace.name` | トレースの名前 |
| `session.id` | 会話（セッション）。同じ会話のトレースをまとめる |
| `langfuse.observation.input` / `output` | 画面に出る入力と出力 |
| `langfuse.observation.level` | WARNING などのレベル。ガードレールの検出に使っている |
| `openinference.span.kind` | span の種類（LLM、RETRIEVER、GUARDRAIL など） |

### 評価で使う機能

- スコア：トレースに数値を付ける。評価ランナーが `eval.correctness` などを付ける
- データセット：質問と模範解答の組。`rag-eval` という名前で登録する
- 実験（dataset run）：データセットを流した1回分。トレースと結び付くので、実験どうしを比べられる

## 動かして確かめる

1. チャット画面で質問し、回答の下のリンクから Langfuse のトレースを開く
2. `rag.guard.input`、`rag.retrieve`、ゲートウェイのLLMのspanが1本のトレースにつながっているかを見る
3. `make eval` の後、データセット `rag-eval` の実験一覧を見る

## 学ぶポイント

- LLMアプリの観測で何を見たいか（プロンプト、検索結果、出力、コスト、評価）
- 設定系のデータと大量のイベントデータを別のデータベースに分ける設計
- トレースにスコアを付けて、改善ループの起点にする考え方

## つまずきやすい点

- 部品が多く、メモリを多く使う。Macでは他のコンポーネントと合わせて余裕を見る
- 鍵を作り直すと、OTel Collector の `LANGFUSE_AUTH` も作り直す必要がある
- OpenInference 形式のspanが、Langfuse でどう表示されるかは未確認（ADR-004）

## 参考資料

- [Langfuse Self-hosting](https://langfuse.com/self-hosting)
- [Langfuse: OpenTelemetry](https://langfuse.com/integrations/native/opentelemetry)
- [Langfuse: Datasets](https://langfuse.com/docs/evaluation/dataset-runs/datasets)
