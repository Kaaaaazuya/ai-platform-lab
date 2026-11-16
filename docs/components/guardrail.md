# ガードレール（Presidio と独自ルール）

## ひとことで

LLMに渡す前の入力と、生成された出力を検査する仕組み。個人情報（PII）をマスクし、プロンプトインジェクションの疑いがある入力を止める。

## このリポジトリでの役割

| 項目 | 内容 |
| --- | --- |
| 検出器 | Presidio Analyzer（コンテナ、:5002）と、アプリ内の日本向けルール |
| 呼び出し元 | アプリAPI（ゲートウェイではない） |
| テストケース | `eval/guard-cases.jsonl`（CIで毎回判定） |
| 確かめ方 | `make guard-check`、`make guard-check-api` |
| 関連ADR | [ADR-005](../adr/0005-guardrails.md) |

## 仕組み

### 入力の検査

1. インジェクションのルール（日本語・英語の典型的な言い回し）に当てはまるかを見る
2. PIIを2段で探す
    - Presidio：メールアドレス、クレジットカード番号、IPアドレス、IBANなど
    - 独自ルール：電話番号、口座番号、マイナンバー、郵便番号、ラベル付きの氏名
3. 見つかった箇所を `<JP_PHONE_NUMBER>` のような種別名に置き換える
4. インジェクションの疑いがあれば、LLMを呼ばずにブロックする

以降の埋め込み・生成・トレース・会話履歴には、マスク後の文字列だけを渡す。

### 出力の検査

生成が終わったら全文を同じ方法で検査する。PIIがあれば、マスク後の全文を `guard` イベントで画面に送り、表示を差し替える。

### Presidio の仕組み

Presidio は Microsoft の OSS で、2つの部品からなる。

- Analyzer：文章の中から PII の位置と種類を探す。正規表現、チェックディジット、文脈の単語、NER（固有表現抽出）を組み合わせる
- Anonymizer：見つかった箇所を置き換える

このリポジトリでは Analyzer だけを使い、置き換えはアプリで行っている。日本語のNERは標準では入っていないので、日本向けのPIIはアプリ側のルールで拾う。

### 位置の数え方

Presidio は Python なので、文字の位置を Unicode のコードポイントで数える。JavaScript の文字列は UTF-16 で数えるため、絵文字などがあると位置がずれる。アプリでは位置をコードポイントにそろえてから置き換えている。

### 判定の記録

判定の結果はspanの属性に載せる。

| 属性 | 意味 |
| --- | --- |
| `guard.blocked` | ブロックしたか |
| `guard.pii.entities` | 見つかったPIIの種類 |
| `guard.injection.rules` | 当てはまったインジェクションのルール |
| `guard.presidio_error` | Presidioに届かなかったときの理由 |

検出があったspanは、Langfuse でレベルが WARNING になる。改善ループで抽出するときの目印になる。

## 動かして確かめる

```bash
make guard-check        # ケースごとの判定とマスク結果を表示する
make guard-check-api    # アプリAPIに流し、トレースIDを表示する
```

## 学ぶポイント

- ルールベースの検知の長所（速い、説明できる）と短所（言い換えに弱い）
- チェックディジット（Luhn）でカード番号の誤検知を減らす方法
- 「失敗したら止める（fail-closed）」と「失敗しても続ける（fail-open）」の選び方。このリポジトリは fail-open にしている

## つまずきやすい点

- ポート番号や日付を電話番号と誤検知しやすい。正規表現の前後の条件で除いている
- 日本語の氏名は、ラベル（「氏名：」など）がないと拾えない
- 「無視」という単語だけでブロックすると、普通の質問まで止めてしまう。ルールは「指示を無視して」のような組み合わせにしている

## 参考資料

- [Microsoft Presidio](https://microsoft.github.io/presidio/)
- [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
