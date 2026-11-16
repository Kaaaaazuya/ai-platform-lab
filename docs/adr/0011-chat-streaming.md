# ADR-011 チャットの応答方式（ストリーミング）

ステータス: Accepted（2026-11-16）

## 要約

- チャットの回答は、API Gateway REST のストリーミングと Lambda で少しずつ返す
- 画面は S3 と CloudFront で静的に配信する
- WebSocket は、サーバーから話しかける機能が必要になったら足す

## 背景

チャットの回答は、LLMが1文字ずつ生成する。全文ができるまで待つと、長い回答では10秒以上何も表示されない。生成した分から少しずつ画面に出す（ストリーミング）と、待ち時間の体感が大きく変わる。

チャット画面は自作し、S3＋CloudFrontで静的に配信する。回答の返し方として WebSocket と Lambda のレスポンスストリーミングを比べた。チャットは「1回質問して、その回答を少しずつ受け取る」一方向の流れで、常時接続は要らない。詳しくは[アプリAPIとチャット画面の解説](../components/app.md)を参照。

## 選択肢

| 案 | 内容 | 長所 | 短所 |
| --- | --- | --- | --- |
| A | API Gateway WebSocket API＋Lambda | 双方向で、サーバーから話しかけられる | 接続IDの管理が要る。29秒の連携タイムアウトを避ける2段構えのLambdaが要る。接続は最長2時間、無通信10分で切れる |
| B | AppSync Events | 接続管理が不要で、Lambdaはチャンネルに送るだけ | サービスが1つ増える。ローカルでの再現は未確認 |
| C | API Gateway REST（ストリーミング）＋Lambda | 1リクエスト1ストリームで単純。認証をAPI Gatewayででき、タイムアウトは最大15分 | サーバーからの通知はできない |
| D | Lambda関数URL（ストリーミング） | 部品が最小 | VPC内のLambdaでは使えない。CloudFrontのOACでPOSTするには本文のハッシュ計算が要る |

## 比較

| 観点 | 案A：WebSocket API | 案B：AppSync Events | 案C：REST（ストリーミング） | 案D：関数URL |
| --- | --- | --- | --- | --- |
| 作りの単純さ | 複雑（接続IDの管理） | 中程度 | 単純 | 最も単純 |
| サーバーからの通知 | できる | できる | できない | できない |
| 認証 | API Gateway | AppSync | API Gateway | IAMか自前 |
| タイムアウト | 接続は最長2時間 | — | 最大15分 | 最大15分 |
| ローカルでの再現 | 未確認 | 未確認 | 未確認（代わりにローカルサーバー） | 未確認 |

## 決定

Cを採用する。画面はS3＋CloudFront（OAC）、入口はAPI Gateway REST（ストリーミング）、アプリAPIはLambda（Node.js）。

## 決定の理由

- チャットは一方向の流れなので、常時接続の仕組み（WebSocket）は持て余す
- API Gatewayで認証できるので、関数URLより入口の統制がしやすい
- 1リクエスト1ストリームなので、トレースも1リクエスト1本で追いやすい（ADR-004）

## 影響

- ADR-005：生成中のトークンは画面に出るので、出力の検査は表示の後になる
- ADR-006：アプリAPIはLambda（Node.js）にした
- ADR-004：ローカルでは同じ処理をHTTPサーバーで動かしている。トレースの形は同じになる

## 受け入れること

- サーバーからの通知や、エージェントが実行途中に利用者へ質問する機能はできない。必要になったらAppSync EventsかWebSocket APIを足す
- 接続が切れてもストリーミング中のLambdaは止まらず、課金が続く。停止ボタンを付けるなら、停止を伝える仕組みを別に作る
- 生成中のトークンはそのまま画面に出るので、出力の全文検査は表示の後になる。表示済みの回答を差し替える方法はADR-005で決める
- ストリーミングが標準で使えるのはNode.js。他の言語にするならLambda Web Adapterなどが要る

## 確認すること

- [ ] AWS EmulatorでAPI Gatewayのストリーミング応答が再現されるか。だめならローカルではアプリAPIを直接起動して代わりにする
- [ ] AIゲートウェイのストリーミング出力を、Lambdaからそのまま中継できるか
- [ ] 2026年10月に出たと報じられているLambda Web Functionsを候補に加えるか

## 参考資料

- [AWS Lambda: Response streaming](https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html)
- [AWS Compute Blog: API Gateway response streaming](https://aws.amazon.com/blogs/compute/building-responsive-apis-with-amazon-api-gateway-response-streaming)
- [API Gateway WebSocket quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-execution-service-websocket-limits-table.html)
- [Build a serverless AI Gateway architecture with AWS AppSync Events](https://aws.amazon.com/blogs/machine-learning/build-a-serverless-ai-gateway-architecture-with-aws-appsync-events)
- [aws-samples: Serverless Strategies for Streaming LLM Responses](https://github.com/aws-samples/sample-serverless-llm-on-aws)
- [CloudFront + Lambda関数URLでPOST/PUT（クラスメソッド）](https://dev.classmethod.jp/articles/cloudfront-lambda-url-with-post-put-request)
