# ADR-001 LLM推論のローカル再現方式

ステータス: Accepted（2026-11-16）

## コンテキスト

AWS Emulatorの公式ブログには、Bedrockで実際にモデルが推論するかどうかの記載がない。アプリからのLLM呼び出しをローカルでどう再現するかを決める必要がある。

## 選択肢

| 案 | 内容 | 長所 | 短所 |
| --- | --- | --- | --- |
| A | ゲートウェイからOllamaへ直結。アプリはOpenAI互換APIで呼ぶ | 構成が単純で確実。Uber型と同じ作り | Bedrock SDKで書いたコードはローカルで試せない |
| B | FlociのBedrock Runtimeエミュレーション経由でOllamaへ転送 | Bedrock SDKのコードをそのまま試せる | エミュレーターが2つになる。互換性は非公式 |
| C | 常に実Bedrockを呼ぶ | 本物の挙動 | 従量課金。オフラインで動かない |

## 判断材料・確認すること

- [ ] AWS EmulatorのFidelityスコアでbedrock-runtimeの対応状況を確認する
- [ ] アプリをBedrock SDKで書くか、OpenAI互換APIで書くかを決める（ADR-002と連動）

## 決定

案A（Ollama）を採用する。アプリはゲートウェイ（Envoy AI Gateway、ADR-002）のOpenAI互換APIだけを呼ぶ。ローカルではゲートウェイがOllamaへ、実AWSではBedrockへ振り分ける。モデルの切り替えはゲートウェイの設定だけで行い、アプリのコードは変えない。

**受け入れること**

- アプリはBedrock SDKを使わない。Bedrock固有の呼び出しはローカルでは試さない
- OllamaのモデルとBedrockのモデルでは品質が違う。品質の比較はM5の実AWS段で行う
- OllamaのモデルがMac（M2）のメモリを使う。モデルの大きさはADR-010のメモリ確認と合わせて決める
