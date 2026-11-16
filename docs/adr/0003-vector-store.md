# ADR-003 RAGのベクトルストア

ステータス: Proposed（MVPでは案Aで仮決め）

## 要約

- RAGの検索に使うベクトルストアを選ぶ
- MVPでは pgvector を、Langfuse と同じ Postgres に別のデータベースとして置いている
- M5で実AWSに持っていく先と合わせて、正式に決める

## 背景

RAGは「質問に近いドキュメントを探し、その内容を添えてLLMに答えさせる」方式だ。探す部分では、ドキュメントを細かく分けたもの（チャンク）を埋め込み（ベクトル）にして保存しておく。質問も埋め込みにして、近いベクトルを持つチャンクを取り出す。この保存と検索を受け持つのがベクトルストアである（[pgvectorの解説](../components/pgvector.md)）。

選ぶときに考えることは3つある。

- ローカルの軽さ：Langfuse、Ollama、AWS Emulatorと同時にMacで動くか
- 検索の質：ベクトル検索だけでよいか、全文検索と組み合わせたハイブリッド検索を試したいか
- 実AWSでの行き先：Aurora PostgreSQL、OpenSearch Service、Bedrock Knowledge Bases のどれに移すか

## 検討した選択肢

### 案A：pgvector（Postgresの拡張）

Postgresにベクトル型と近傍検索のインデックス（HNSW、IVFFlat）を足す拡張。

- 長所：コンポーネントが増えない。SQLで検索結果とメタデータを結合できる。実AWSではAurora PostgreSQLやRDSでそのまま使える
- 短所：Langfuseと同じPostgresに置くと、片方の負荷がもう片方に響く。全文検索との組み合わせは自分で書く
- 学べること：HNSWインデックス、距離関数（コサイン類似度など）、SQLでのRAG

### 案B：OpenSearch（コンテナ）

全文検索エンジンに、k-NN（近傍検索）の機能があるもの。

- 長所：全文検索（BM25）とベクトル検索を組み合わせたハイブリッド検索を試せる。実AWSではOpenSearch Serviceになる
- 短所：メモリを多く使う。Mac上で他のコンポーネントと同時に動かすのは厳しい
- 学べること：ハイブリッド検索、スコアの正規化、検索エンジンの運用

### 案C：実AWSのBedrock Knowledge Bases

- 長所：取り込み・チャンク分割・埋め込み・検索をまとめて任せられる。GenUと同じ構成になる
- 短所：ローカルで再現できない。使うたびに課金される。中身が見えにくい
- 学べること：マネージドなRAGの使い方。ただし仕組みの理解には向かない

## 比較

| 観点 | 案A：pgvector | 案B：OpenSearch | 案C：Knowledge Bases |
| --- | --- | --- | --- |
| ローカルで動くか | 動く（軽い） | 動く（重い） | 動かない |
| 追加の部品 | なし（Postgresを流用） | 1つ | 実AWS |
| ハイブリッド検索 | 自作 | 標準 | 標準 |
| 仕組みの見えやすさ | 高い | 中程度 | 低い |
| 実AWSでの行き先 | Aurora PostgreSQL / RDS | OpenSearch Service | そのまま |

## 決定

未定。MVP（M1＋M2）では案A（pgvector）で仮決めし、Langfuseと同じPostgresに別DB（`rag`）として同居させている。

## 仮決めの理由

- MacのメモリをLangfuseとOllamaに回したい。部品を増やさない案Aが一番軽い
- SQLで中身を直接見られるので、検索がうまくいかないときに原因を追いやすい
- 実AWSに移すときも、Aurora PostgreSQLならアプリのコードをほぼ変えずに済む

## 影響

- ADR-008：検索の的中率を評価に入れた。ベクトルストアを変えたら、同じ評価で比べられる
- ADR-007：実AWSに移す先によって、常時課金の有無が変わる（OpenSearch Serviceは常時課金になりやすい）

## 確認すること

- [ ] ローカルマシンのメモリ（Langfuseと同時に動かせるか）
- [ ] M5で実AWSに持っていく先をどれにするか
- [ ] 検索の的中率が低い質問に対して、ハイブリッド検索（案B）を試す価値があるか

## 参考資料

- [pgvector](https://github.com/pgvector/pgvector)
- [OpenSearch: k-NN search](https://opensearch.org/docs/latest/search-plugins/knn/index/)
- [Amazon Bedrock Knowledge Bases](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base.html)
