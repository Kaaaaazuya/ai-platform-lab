# ADR-001 LLM推論のローカル再現方式

ステータス: Accepted（2026-11-16）

## 要約

- アプリからのLLM呼び出しは、ローカルではOllamaで再現する
- アプリはAIゲートウェイのOpenAI互換APIだけを呼び、Bedrock SDKは使わない
- モデルの切り替えはゲートウェイの設定で行う

## 背景

このプラットフォームの中心は「アプリ → AIゲートウェイ → モデル」という呼び出しの流れだ。開発中は、1日に何度もLLMを呼ぶ。評価（ADR-008）では、同じ質問を何度も流して採点する。これを従量課金のクラウドLLMで回すと、費用が気になって試行回数が減る。学習が目的なので、失敗を気にせず何度でも呼べることが大事になる。

一方、AWS Emulator（[解説](../components/aws-emulator.md)）の公式ブログには、Bedrockで実際にモデルが推論されるかの記載がない。エミュレーターはAPIの形を再現する道具で、推論そのものを持っていないと考えるのが自然だ。そこで、LLMの推論だけは別の手段でローカルに用意する必要がある。

## 検討した選択肢

### 案A：ゲートウェイからOllamaへ直結する

アプリはOpenAI互換API（`/v1/chat/completions` など）でゲートウェイを呼ぶ。ゲートウェイがOllama（[解説](../components/ollama.md)）に転送する。

- 長所：構成が単純で、確実に動く。Uberなどの社内AI基盤と同じ「アプリは共通APIだけを知る」作りになる
- 短所：Bedrock SDK（`InvokeModel` や `Converse`）で書いたコードは、ローカルでは試せない
- 学べること：モデルの抽象化をゲートウェイに寄せる設計。OpenAI互換APIの仕様

### 案B：エミュレーターのBedrock RuntimeからOllamaへ転送する

Bedrock Runtimeを再現する別のエミュレーター（Flociなど）を置き、裏でOllamaに流す。

- 長所：Bedrock SDKで書いたコードを、そのままローカルで試せる
- 短所：エミュレーターが2つになる。Bedrockとの互換性は非公式で、細かな差が出たときに原因を追いにくい
- 学べること：Bedrock APIの形。ただし本物との差を常に疑う必要がある

### 案C：常に実Bedrockを呼ぶ

- 長所：本物の挙動と品質で開発できる
- 短所：呼ぶたびに課金される。オフラインでは動かない。評価を何度も回すと費用がかさむ
- 学べること：Bedrockそのもの。ただし試行回数が減る

## 比較

| 観点 | 案A：Ollama直結 | 案B：Bedrockエミュレーター | 案C：実Bedrock |
| --- | --- | --- | --- |
| 費用 | 0円 | 0円 | 従量課金 |
| オフラインで動くか | 動く | 動く | 動かない |
| 構成の単純さ | 単純 | 部品が増える | 単純 |
| 本番との近さ | API形式が違う | 近いが非公式 | 同じ |
| 社内AI基盤の事例との近さ | 近い | 中程度 | 中程度 |

## 決定

案A（Ollama）を採用する。アプリはゲートウェイ（Envoy AI Gateway、ADR-002）のOpenAI互換APIだけを呼ぶ。ローカルではゲートウェイがOllamaへ、実AWSではBedrockへ振り分ける。モデルの切り替えはゲートウェイの設定だけで行い、アプリのコードは変えない。

## 決定の理由

- 費用を気にせず何度でも呼べることが、学習と評価の両方で一番効く
- アプリが共通APIだけを知る形にしておけば、Bedrockに切り替えるときもアプリは変わらない。これはゲートウェイを置く目的そのものでもある
- Bedrock固有の機能（Guardrailsなど）は、M5の実AWS段でまとめて確かめれば足りる

## 影響

- ADR-002：ゲートウェイがOpenAI互換APIを提供し、Ollamaへ転送できる必要がある
- ADR-008：判定役のモデルもOllamaで動かせる
- ADR-010：OllamaがMacのメモリを使うので、K8sやLangfuseと同時に動かせるかが制約になる

## 受け入れること

- アプリはBedrock SDKを使わない。Bedrock固有の呼び出しはローカルでは試さない
- OllamaのモデルとBedrockのモデルでは品質が違う。品質の比較はM5の実AWS段で行う
- OllamaのモデルがMac（M2）のメモリを使う。モデルの大きさはADR-010のメモリ確認と合わせて決める

## 確認すること

- [ ] AWS EmulatorのFidelityスコアで、bedrock-runtimeの対応状況を確かめる
- [x] アプリをBedrock SDKで書くか、OpenAI互換APIで書くかを決める（ADR-002と連動） → OpenAI互換API

## 参考資料

- [Ollama: OpenAI compatibility](https://github.com/ollama/ollama/blob/main/docs/openai.md)
- [Uber: GenAI Gateway](https://www.uber.com/blog/genai-gateway/)
