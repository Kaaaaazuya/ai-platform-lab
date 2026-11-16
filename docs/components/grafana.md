# Grafana（otel-lgtm）

## ひとことで

メトリクス、ログ、トレースをまとめて見られる観測の画面。このリポジトリでは、システム全体が動いているかを見る死活監視を受け持つ。

## このリポジトリでの役割

| 項目 | 内容 |
| --- | --- |
| イメージ | `grafana/otel-lgtm`（1つのコンテナに一式が入ったもの） |
| 画面 | http://localhost:3001 |
| 受信 | OTel Collector から OTLP で受け取る |
| 関連ADR | [ADR-004](../adr/0004-observability.md) |

## 仕組み

otel-lgtm は、Grafana Labs の観測の部品を1つのコンテナにまとめた開発用のイメージだ。名前は中身の頭文字から来ている。

| 部品 | 扱うデータ |
| --- | --- |
| Loki | ログ |
| Grafana | 画面とアラート |
| Tempo | トレース |
| Mimir / Prometheus | メトリクス |

中にも OTel Collector が入っていて、OTLP をそのまま受け取れる。本番ではそれぞれを別に立てるが、学習用にはこれ1つで足りる。

### 見るもの

- アプリAPIのレイテンシとエラー率（HTTPの自動計装から出るメトリクス）
- ゲートウェイの GenAI メトリクス（トークン数、最初のトークンまでの時間など）
- Tempo のトレース：どの段で時間がかかっているか

### Langfuse との分担

Grafana は「システムとして健全か」を見る場所で、Langfuse は「AIの答えが良いか」を見る場所だ。Grafana で気になるトレースを見つけたら、同じトレースIDで Langfuse を開く（ADR-004の調査の流れ）。

## 学ぶポイント

- メトリクス・ログ・トレースの3つの使い分け
- トレースIDで3つを行き来する方法（ログにトレースIDを載せる、トレースからログへ飛ぶ）
- 死活監視のアラートの作り方（エラー率、レイテンシ、トークン数の急増）

## つまずきやすい点

- otel-lgtm は開発用で、データの保持や性能は本番向けではない
- 既定の管理者パスワードは `admin`。ローカル（127.0.0.1）にしか公開していない前提で使う

## 参考資料

- [grafana/docker-otel-lgtm](https://github.com/grafana/docker-otel-lgtm)
- [Grafana Tempo](https://grafana.com/docs/tempo/latest/)
