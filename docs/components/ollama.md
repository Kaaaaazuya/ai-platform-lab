# Ollama

## ひとことで

手元のマシンでLLMを動かすランタイム。モデルの取得と実行を1つのコマンドで行え、OpenAI互換のAPIも持っている。

## このリポジトリでの役割

| 項目 | 内容 |
| --- | --- |
| 動かす場所 | ホストのMac（コンテナではない） |
| ポート | 11434 |
| チャットのモデル | `qwen2.5:7b` |
| 埋め込みのモデル | `bge-m3`（1024次元） |
| 取得 | `task models` |
| 関連ADR | [ADR-001](../adr/0001-local-llm.md) |

## 仕組み

Ollama は llama.cpp を土台にしていて、量子化したモデル（GGUF形式）を CPU や GPU で動かす。Apple Silicon では Metal を使ってGPUで計算する。

量子化は、モデルの重みを少ないビット数で表して小さくする方法だ。7Bのモデルでも、4ビット程度に量子化すれば数GBのメモリで動く。そのぶん精度は少し落ちる。

### ホストで動かす理由

Docker Desktop for Mac のコンテナからは、MacのGPU（Metal）を使えない。コンテナで動かすとCPUだけの計算になり、とても遅い。そこで Ollama はホストで動かし、ゲートウェイのコンテナから `host.docker.internal` で呼んでいる。

## 動かして確かめる

```bash
ollama list                     # 取得済みのモデル
ollama run qwen2.5:7b "こんにちは"
curl -s http://localhost:11434/v1/models
```

## 学ぶポイント

- モデルの大きさ（パラメーター数）、量子化、メモリの関係
- チャット用のモデルと埋め込み用のモデルの役割の違い
- OpenAI互換APIのおかげで、アプリやゲートウェイを変えずにモデルを差し替えられること

## つまずきやすい点

- モデルを読み込んだ直後の1回目は遅い。しばらく使わないとメモリから外され、また遅くなる
- 他のコンポーネント（Langfuse など）と同時に動かすと、Macのメモリが不足しやすい
- 評価の採点役も同じモデルにしているので、採点が甘くなりやすい（ADR-008）

## 参考資料

- [Ollama](https://github.com/ollama/ollama)
- [Ollama: OpenAI compatibility](https://github.com/ollama/ollama/blob/main/docs/openai.md)
- [llama.cpp](https://github.com/ggml-org/llama.cpp)
