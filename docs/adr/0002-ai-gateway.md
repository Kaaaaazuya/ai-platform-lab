# ADR-002 AIゲートウェイの選定

ステータス: Accepted（2026-11-16）

## 要約

- AIゲートウェイには Envoy AI Gateway（現 Agent Router）を使う
- ローカルでは `aigw run` のスタンドアロンモードで動かし、後でKubernetesに載せる
- 利用量の上限はトークン単位のレート制限で、PIIの検査はアプリ側（ADR-005）で行う

## 背景

社内AI基盤の事例（Uber GenAI Gateway、デジタル庁の源内など）には共通点がある。アプリがLLMを直接呼ばず、必ずゲートウェイを通すことだ。ゲートウェイに集めると、次のことを1か所で行える。

- 認証と、チームやアプリごとの利用量の上限
- モデルの振り分けと、失敗したときのフォールバック
- 全呼び出しの記録（トレース、トークン数、費用）
- PIIのマスクなどのガードレール

このため、ゲートウェイは構成の中心で、観測・セキュリティ・改善ループの起点になる。選び方は学習の狙いで変わる。「運用を体験する」ことを重視するなら機能の揃った製品が向く。「仕組みを内側から理解する」ことを重視するなら、自作や低レベルな部品が向く。詳しくは[Envoy AI Gatewayの解説](../components/ai-gateway.md)を参照。

## 検討した選択肢

### 案A：LiteLLM Proxy（OSS）

PythonのOSSで、100以上のLLMプロバイダーをOpenAI互換APIにまとめるプロキシ。

- 長所：仮想キー、キーごとの予算、利用ログ、フォールバック、OTel連携が揃っている。管理画面がある。情報が多い
- 短所：PostgresとRedisが要る。SSOなどはEnterprise版
- 学べること：社内AI基盤の「運用者の画面」。仮想キーと予算管理の考え方

### 案B：Envoy AI Gateway

Envoy Proxy と Envoy Gateway の上に作られたAIゲートウェイ。Bloomberg と Tetrate が中心になって開発している。

- 長所：Bloombergが関わる二段構成（入口のゲートウェイと、モデルへの出口のゲートウェイ）のリファレンスを再現できる。Kubernetes Gateway APIに沿っている
- 短所：本来はKubernetesが前提。日本語の情報が少ない
- 学べること：Envoyの拡張の仕組み（外部処理など）、Gateway API、プロキシとしてのゲートウェイ

### 案C：自作（Go、Uber GenAI Gateway型）

- 長所：OpenAI互換API、PIIマスク、監査ログを自分で作るので、仕組みを深く理解できる
- 短所：工数が大きい。ストリーミングの中継や再試行など、細かい作り込みが要る
- 学べること：ゲートウェイの中身すべて。ただし本筋（RAGや改善ループ）に届くまで時間がかかる

## 比較

| 観点 | 案A：LiteLLM | 案B：Envoy AI Gateway | 案C：自作 |
| --- | --- | --- | --- |
| すぐ動くか | 動く | 動く（`aigw run`） | 作るまで動かない |
| 利用量の管理 | 仮想キーごとの予算 | トークン単位のレート制限 | 自分で作る |
| ガードレール | プラグインで足せる | 外部処理で足す | 自分で作る |
| Kubernetesとの相性 | 普通 | 良い（Gateway API） | 自分次第 |
| 観測（OTel） | 対応 | 対応（GenAIメトリクス、OpenInference） | 自分で作る |
| 情報の量 | 多い | 少ない（英語中心） | — |

## 決定

!!! note "名称変更"
    Envoy AI Gatewayは2026年にAgent Router（theagentrouter/agent-router）へ改名された。CLI（`aigw`）とコンテナイメージ（`envoyproxy/ai-gateway-cli`）は同じ名前のまま。

案B（Envoy AI Gateway）を採用する。ローカルでは`aigw run`のスタンドアロンモードで動かす（KubernetesとDockerは不要）。ADR-010でKubernetesを用意したら、同じ設定をクラスターに載せる。

## 決定の理由

- OpenAI互換の1つのAPIで、OllamaやBedrockなどへ振り分けられる
- 同じ設定ファイルをスタンドアロンとKubernetesの両方で使える
- トークン単位のレート制限、プロバイダーのフォールバックがある
- GenAIメトリクスとOTelトレースを出すので、ADR-004の観測方針と合う
- Kubernetes Gateway APIに沿っており、ADR-010（K8s＋gVisor）と同じクラスターで学べる

## 影響

- ADR-001：アプリはゲートウェイのOpenAI互換APIだけを呼ぶ
- ADR-004：ゲートウェイのspanとメトリクスをOTel Collectorに送る
- ADR-005：PIIの検査はゲートウェイに内蔵されていないので、アプリ側に置いた
- ADR-010：Kubernetesに載せるときは、Envoy Gatewayと一緒に入れる

## 受け入れること（LiteLLMとの差）

- LiteLLMのような仮想キーごとの予算管理や管理画面はない。利用量の上限はトークン単位のレート制限で代わりにし、アプリの認証はEnvoy Gatewayの仕組みで行う
- 送信前のPIIマスクやインジェクション検知は内蔵していない。M3ではアプリ側で行うことにした（ADR-005）
- CLI（aigw）は実験的な扱い

## 確認すること

- [ ] `aigw run`でOllamaにつながり、ストリーミング応答が中継されるか（ADR-011）
- [ ] アプリの認証（APIキーかJWT）の設定方法
- [ ] トレースの形式（OpenInference、またはGenAI規約）と、Langfuseでの表示（ADR-004）

## 参考資料

- [aigw run（Envoy AI Gateway Docs）](https://aigateway.envoyproxy.io/docs/cli/aigwrun)
- [Envoy AI Gateway v1.0 release notes](https://aigateway.envoyproxy.io/release-notes/v1.0/)
- [Envoy AI Gateway v1.1 release notes](https://aigateway.envoyproxy.io/release-notes/v1.1)
- [Envoy AI Gateway Reference Architecture](https://aigateway.envoyproxy.io/blog/envoy-ai-gateway-reference-architecture/)
- [Monitoring Envoy AI Gateway with Apache SkyWalking](https://skywalking.apache.org/blog/2026-04-02-envoy-ai-gateway-monitoring/)
- [LiteLLM Proxy](https://docs.litellm.ai/docs/simple_proxy)
- [Uber: GenAI Gateway](https://www.uber.com/blog/genai-gateway/)
