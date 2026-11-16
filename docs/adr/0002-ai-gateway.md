# ADR-002 AIゲートウェイの選定

ステータス: Accepted（2026-11-16）

## コンテキスト

ゲートウェイは構成の中心で、観測・セキュリティ・改善ループの起点になる。学習の狙いを「運用を体験する」に置くか「仕組みを内側から理解する」に置くかで選ぶものが変わる。

## 選択肢

| 案 | 内容 | 長所 | 短所 |
| --- | --- | --- | --- |
| A | LiteLLM Proxy（OSS） | 仮想キー、予算、利用ログ、フォールバック、OTel v2が揃う。情報が多い | PostgresとRedisが必要。SSOなどはEnterprise版 |
| B | Envoy AI Gateway | Bloombergが関わる二段構成のリファレンスを再現できる。Kubernetes Gateway APIに沿う | Kubernetesが前提。情報は英語中心 |
| C | 自作（Go、Uber GenAI Gateway型） | OpenAI互換IF、PIIマスク、監査ログを自分で作り深く理解できる | 工数が大きい |

## 判断材料・確認すること

- [ ] まずAで運用を体験し、後からCで一部（PIIマスクなど）を自作する二段構えにするか
- [ ] ADR-001の呼び出し方式との相性

## 決定

!!! note "名称変更"
    Envoy AI Gatewayは2026年にAgent Router（theagentrouter/agent-router）へ改名された。CLI（`aigw`）とコンテナイメージ（`envoyproxy/ai-gateway-cli`）は同じ名前のまま。

案B（Envoy AI Gateway）を採用する。ローカルでは`aigw run`のスタンドアロンモードで動かす（KubernetesとDockerは不要）。ADR-010でKubernetesを用意したら、同じ設定をクラスターに載せる。

**理由**

- OpenAI互換の1つのAPIで、OllamaやBedrockなどへ振り分けられる
- 同じ設定ファイルをスタンドアロンとKubernetesの両方で使える
- トークン単位のレート制限、プロバイダーのフォールバックがある
- GenAIメトリクスとOTelトレースを出すので、ADR-004の観測方針と合う
- Kubernetes Gateway APIに沿っており、ADR-010（K8s＋gVisor）と同じクラスターで学べる

**受け入れること（LiteLLMとの差）**

- LiteLLMのような仮想キーごとの予算管理や管理画面はない。利用量の上限はトークン単位のレート制限で代わりにし、アプリの認証はEnvoy Gatewayの仕組みで行う
- 送信前のPIIマスクやインジェクション検知は内蔵していない。外部処理として組み込む（ADR-005）
- CLI（aigw）は実験的な扱い

**確認すること**

- [ ] `aigw run`でOllamaにつながり、ストリーミング応答が中継されるか（ADR-011）
- [ ] アプリの認証（APIキーかJWT）の設定方法
- [ ] トレースの形式（OpenInference、またはGenAI規約）と、Langfuseでの表示（ADR-004）

**参考資料**

- [aigw run（Envoy AI Gateway Docs）](https://aigateway.envoyproxy.io/docs/cli/aigwrun)
- [Envoy AI Gateway v1.0 release notes](https://aigateway.envoyproxy.io/release-notes/v1.0/)
- [Envoy AI Gateway v1.1 release notes](https://aigateway.envoyproxy.io/release-notes/v1.1)
- [Monitoring Envoy AI Gateway with Apache SkyWalking](https://skywalking.apache.org/blog/2026-04-02-envoy-ai-gateway-monitoring/)
