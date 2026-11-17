# pgvector

## ひとことで

Postgres にベクトル型と近傍検索のインデックスを足す拡張。RAGで使うチャンクの埋め込みを保存し、質問に近いものを探す。

## このリポジトリでの役割

| 項目 | 内容 |
| --- | --- |
| イメージ | `pgvector/pgvector:pg17` |
| ポート | 127.0.0.1:5433 |
| データベース | `rag`（Langfuse と同じ Postgres に同居） |
| 取り込み | `task docs ingest` |
| 関連ADR | [ADR-003](../adr/0003-vector-store.md) |

## 仕組み

### 取り込み（ingest）

1. Markdown の front matter や Hugo のショートコードを取り除く
2. 見出しの区切りを目安に、1200文字程度のチャンクに分ける。前後は150文字ずつ重ねる
3. チャンクを16件ずつゲートウェイに送り、埋め込み（bge-m3、1024次元）にする
4. `chunks` テーブルに、資料名・見出し・本文・埋め込みを保存する

### 検索

質問を同じモデルで埋め込みにし、コサイン距離が近い順に上位4件を取り出す。インデックスは HNSW を使う。

```sql
SELECT id, source, heading, content, 1 - (embedding <=> $1) AS score
  FROM chunks ORDER BY embedding <=> $1 LIMIT $2
```

`$1` は質問の埋め込み、`$2` は取り出す件数（既定は4件）。

`<=>` はコサイン距離の演算子。`1 - 距離` を類似度のスコアとして画面に出している。

### HNSW とは

近いベクトルを素早く探すためのグラフ構造のインデックス。全件と比べずに、近そうな点をたどって探す。速さと引き換えに、本当の最近傍を取り逃すことがある（近似検索）。

## 動かして確かめる

```bash
psql postgresql://postgres:postgres@127.0.0.1:5433/rag -c "SELECT source, count(*) FROM chunks GROUP BY 1;"
```

## 学ぶポイント

- 埋め込みの次元数とモデルの関係。モデルを変えたら、テーブルを作り直して全件を取り込み直す
- チャンクの大きさと重なりが、検索の的中率にどう効くか。評価（ADR-008）で比べられる
- 距離関数（コサイン、内積、ユークリッド）の違い

## つまずきやすい点

- 埋め込みモデルを変えたのにテーブルの次元数が古いままだと、保存で失敗する
- Langfuse と同じ Postgres に置いているので、大量に取り込むと Langfuse の応答が遅くなりうる

## 参考資料

- [pgvector](https://github.com/pgvector/pgvector)
- [BGE-M3](https://huggingface.co/BAAI/bge-m3)
