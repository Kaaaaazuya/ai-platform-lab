# ADR一覧

未解決の設計判断はADR（Architecture Decision Record）で詰める。決まったものはステータスを Accepted にして決定内容を書く。

| ADR | テーマ | ステータス | 決定・現状 |
| --- | --- | --- | --- |
| [001](0001-local-llm.md) | LLM推論のローカル再現方式 | Accepted | Ollama。アプリはゲートウェイのOpenAI互換APIだけを呼ぶ |
| [002](0002-ai-gateway.md) | AIゲートウェイの選定 | Accepted | Envoy AI Gateway（現 Agent Router）。`aigw run`で動かす |
| [003](0003-vector-store.md) | RAGのベクトルストア | Proposed | MVPはpgvectorで仮決め |
| [004](0004-observability.md) | 観測基盤の構成 | Accepted | OTelで共通化。Grafana（死活）とLangfuse（AI処理）を同じトレースIDでつなぐ |
| [005](0005-guardrails.md) | ガードレールの実装位置とログ方針 | Accepted | アプリAPIからPresidio＋日本向けルール。ログはマスク後のみ |
| [006](0006-iac-cicd.md) | IaCとCI/CDでの検証方式 | Accepted | Terraform。PRはAWS Emulator、mainマージ後は承認付きで実AWS |
| [007](0007-aws-budget.md) | 実AWSで検証する範囲と予算 | Proposed | 未定（M5で決める） |
| [008](0008-evaluation.md) | 評価の仕組み | Proposed | 未定（M4で決める） |
| [009](0009-dataset.md) | 題材にするユースケースとデータ | Proposed | MVPは公開技術ドキュメント（OpenTelemetry）で仮決め |
| [010](0010-sandbox.md) | アプリ実行サンドボックス | Proposed | K8s＋gVisorの方向。ローカルK8sと載せ方は未定 |
| [011](0011-chat-streaming.md) | チャットの応答方式 | Accepted | API Gateway REST（ストリーミング）＋Lambda |
| [012](0012-software-factory.md) | エージェントによる実装ライン | Proposed | 流れは合意済み。仕様の置き場所と動かし方は未定 |
| [013](0013-dev-quality-supply-chain.md) | 開発時の品質チェックとサプライチェーン対策 | Accepted | Biome・gitleaks・lefthook。npm は ignore-scripts と npm ci、Actions はSHA固定 |

## 書き方

新しいADRは `docs/adr/NNNN-<slug>.md` に追加し、`mkdocs.yml` の `nav` に足す。構成は「コンテキスト → 選択肢 → 判断材料・確認すること → 決定」。
