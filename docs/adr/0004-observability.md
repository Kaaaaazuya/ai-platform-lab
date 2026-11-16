# ADR-004 観測基盤の構成

ステータス: Accepted（2026-11-16）

## コンテキスト

LLMのトレース・評価と、アプリの一般的なログ・メトリクスを同じ仕組みで見るか分けるかを決める。OTelのGenAI規約はまだDevelopment扱いで、属性名が変わりうる。

## 選択肢

| 案 | 内容 | 長所 | 短所 |
| --- | --- | --- | --- |
| A | Langfuse（セルフホスト）＋Grafana系 | トレース、評価、プロンプト管理、データセットが1つにまとまる | Postgres、ClickHouse、Redis、S3互換ストレージが必要で、最低4GB RAM程度 |
| B | Grafana系（Tempo、Loki）だけに統一 | 汎用の観測基盤1つで済む | 評価、プロンプト管理、データセットの機能がない |
| C | Langfuse Cloud＋Grafana系 | ローカルが軽くなる | トレースを外部に送る |

## 判断材料・確認すること

- [ ] LangfuseのS3にAWS EmulatorのS3を使えるか（使えなければMinIO）
- [ ] Collectorで属性名の変換をどこまで吸収するか

## 決定

OpenTelemetryを共通の土台にして、トレースIDとメトリクスを全体で揃える。システム全体の死活監視はGrafana、AI処理ごとのトレースと評価はLangfuseが受け持ち、同じトレースIDで行き来して調査する（選択肢Aを、OTelでつなぐ形にしたもの）。

**構成**

- 画面 → API Gateway → Lambda → Envoy AI Gateway → Ollama / Bedrockまで、W3C Trace Context（traceparent）を引き継ぐ
- 各コンポーネントはOTLPでOTel Collectorに送る。Collectorが振り分ける：全トレース・メトリクス・ログ → Grafana系（Tempo、Prometheus、Loki）、LLM関連のspan → Langfuse
- LangfuseはOTelのトレースIDをそのまま使うので、同じIDでGrafanaとLangfuseの両方を引ける。Grafanaのトレース画面からLangfuseのトレースへリンクを張る
- Envoy AI GatewayのGenAIメトリクス（トークン数、レイテンシなど）もGrafanaで見る

**調査の流れ**

1. Grafanaのアラート（エラー率、レイテンシ、トークン数の急増）で気づく
2. 該当する時間帯のトレースをTempoで開き、どの段（API Gateway、Lambda、ゲートウェイ、LLM）で起きたか特定する
3. 同じトレースIDでLangfuseを開き、プロンプト、検索結果、評価スコアを見る

**受け入れること**

- LLM関連のトレースをTempoとLangfuseの2か所に保存する。ローカルでは容量とメモリに注意
- GenAIの属性名はまだ固まっていない。Collectorで吸収する

**確認すること**

- [ ] API GatewayとLambdaでtraceparentが引き継がれるか
- [ ] Envoy AI Gatewayのトレース（OpenInference形式）がLangfuseで生成（generation）として表示されるか
- [ ] GrafanaからLangfuseへのリンクの張り方（データリンクでLangfuseのトレースURLを開く）

**参考資料**

- [Langfuse: OpenTelemetry連携（v4移行）](https://langfuse.com/integrations/native/opentelemetry/migration-to-v4.md)
- [Langfuse: OpenTelemetry for LLM Observability](https://langfuse.com/integrations/native/opentelemetry)
