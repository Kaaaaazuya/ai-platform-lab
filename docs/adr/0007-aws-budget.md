# ADR-007 実AWSで検証する範囲と予算

ステータス: Accepted（2026-11-17。上限額はM5で実測して見直す）

## 要約

- 実AWSで確かめるのは、IAMの最小権限と Bedrock Guardrails の2つに絞る。Bedrockの品質比較とスロットリングは、いまはやらない
- 検証専用のAWSアカウントを新しく作り、東京リージョンで動かす
- 検証は手動で動かしたときだけ流す。承認してから apply し、確かめたら destroy する
- 月の上限は5ドル。50%と80%でメールが届き、100%で Bedrock を呼べなくする
- 消し忘れに備え、期限のタグを付けて毎日残りを探す。消すのは人が決める

## 背景

AWS Emulator は便利だが、確かめられないことがある。

- IAM：エミュレーターはIAMポリシーを本物と同じようには評価しない。拒否されるべきリクエストも通る
- Bedrockの推論：ローカルではOllamaで代わりにしている（ADR-001）。モデルの品質は本物でしか比べられない
- Bedrock Guardrails：ローカルにはない
- スロットリング、障害、リージョンの差：エミュレーターは再現しない

一方で、個人の学習なので費用は抑えたい。実AWSで「何を」「どの頻度で」「いくらまで」確かめるかを、先に決めておく必要がある。特に避けたいのは、消し忘れたリソースへの課金が続くことだ。

## 決めること

| 項目 | 候補 | 考えること |
| --- | --- | --- |
| 検証対象 | IAM最小権限、Bedrockの品質比較、Bedrock Guardrails、GenUとの構成比較 | ローカルで確かめられないものに絞る |
| 月の上限額 | 未定 | 1回の検証費用をM5で実測してから決める |
| アラート | AWS Budgetsのしきい値と通知先 | 上限額の50%・80%・100%で通知するなど |
| 使い方 | 検証のたびに立てて壊す / 一部を常設する | 常設は消し忘れの心配がないが、課金が続く |
| 使わないサービス | 常時課金のもの（Kendra、OpenSearch Serviceのプロビジョンドなど） | 使うなら時間を決めて壊す |

## 検討している使い方

### 案A：検証のたびに立てて壊す

CI/CD（ADR-006）の実AWS段で apply → スモークテスト → destroy まで自動で流す。

- 長所：費用は検証した分だけで済む。ただし apply の途中失敗や、テストの失敗・取り消しで destroy まで届かないことがある。失敗時の後片付けと、残ったリソースの定期的な確認は別に要る
- 短所：立ち上げに時間がかかるものは検証が遅くなる
- 学べること：環境を毎回作り直す運用、destroyまで含めたパイプライン

### 案B：一部を常設する

Bedrockのモデルアクセスや、IAMロールのように課金されないものは常設する。

- 長所：検証が早い
- 短所：常設の範囲を誤ると課金が続く
- 学べること：常設と使い捨ての境界の引き方

## 国内外の事例から学んだこと

- 検証用のアカウントを分け、期限が来たら中身を全部消すやり方が広く使われている。AWS公式の Innovation Sandbox on AWS は、期限が来ると AWS Nuke でアカウントを掃除する。英国政府の Modernisation Platform も、開発用アカウントを週1回すべて消して作り直している
- 立てて壊すだけでは、CIの取り消しやランナーの停止で destroy まで届かないことがある。期限のタグと、別の掃除の手段を持つのが普通だ
- AWS Budgets の請求データは数時間遅れる。アラートだけでは Bedrock の使いすぎを止めきれないので、Budgets のアクションで Bedrock を拒否する IAM ポリシーを自動で付けるやり方が勧められている
- GitHub Actions から入るときは OIDC を使い、信頼ポリシーで Environment やブランチまで絞る
- Bedrock Guardrails の Standard tier は、リージョンをまたぐ推論が前提で、東京で作っても別のリージョンで処理されることがある。日本語に対応していない検査もある

## 決定

| 項目 | 決めたこと | 理由 |
| --- | --- | --- |
| 検証対象 | IAMの最小権限、Bedrock Guardrails | エミュレーターで確かめられない度合いが大きく、費用も小さい。Bedrockの品質比較とスロットリングは、トークン代や負荷で費用が読みにくいので見送る |
| アカウント | 検証専用のアカウントを新しく作る | 請求が分かれ、中身を全部消しても困らない |
| リージョン | 東京（ap-northeast-1） | 国内の社内AI基盤に近い条件で試す。Guardrails は Classic tier を使い、処理を東京に留める |
| 頻度 | 手動で動かしたときだけ（`workflow_dispatch`） | 確かめたい変更があるときにだけ流し、費用を読めるようにする |
| 流れ | plan → 承認 → apply → スモークテスト → destroy | 案A。途中で失敗しても destroy まで流す |
| 上限額 | 月5ドル（目安。請求データの遅れで超えることがある） | IAM と Guardrails だけなら、1回の検証は数十円以下の見込み。M5で実測して見直す |
| アラート | 実績が50%と80%でメール。100%で Budgets のアクションが動く | 請求データの遅れを見込み、早めに知らせる |
| 上限を超えたとき | GitHub Actions のロールに、Bedrock を拒否する IAM ポリシーを自動で付ける | アラートだけでは止まらないため |
| 消し忘れ対策 | 作った日時と消す期限のタグを付け、毎日のワークフローで残りを探して知らせる。消すのは人 | 自動で全部消す（aws-nuke など）は、state の S3 などを除く設定が要り、誤って消す危険もある |
| 入り方 | OIDC。信頼ポリシーの `sub` は Environment 名で絞る。main だけに絞るのは、Environment のブランチの設定で行う | 長く使える鍵を置かない |
| 常設するもの | Terraform の state を置く S3 バケット、OIDC のプロバイダーとロール、Budgets | どれも課金はほぼない。常時課金のサービス（Kendra、OpenSearch のプロビジョンドなど）は使わない |

## 確認すること（M5で）

- [ ] 検証1回あたりの費用を実測し、上限額を見直す
- [ ] Budgets のアクションが、本当に Bedrock の呼び出しを止めるか
- [ ] Guardrails の Classic tier が東京で使え、日本語の入力でどの検査が効くか
- [ ] destroy の後に、期限タグを探すワークフローが何も見つけないこと

## 影響

- ADR-001：Bedrockとの品質比較の範囲がここで決まる
- ADR-003：ベクトルストアを実AWSに持っていく先によって、常時課金の有無が変わる
- ADR-006：実AWS段は、mainへのマージごとではなく、手動で動かしたときだけ流す
- ADR-012：エージェントに実AWSを触らせない理由の1つが、この予算である

## 参考資料

- [AWS Budgets](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html)
- [Fidelity in AWS Emulator](https://docs.aws.amazon.com/emulator/latest/userguide/fidelity.html)
- [Innovation Sandbox on AWS](https://docs.aws.amazon.com/solutions/innovation-sandbox-on-aws/)
- [Modernisation Platform: Auto-nuke](https://user-guide.modernisation-platform.service.justice.gov.uk/concepts/environments/auto-nuke.html)
- [予算アクションを設定する](https://docs.aws.amazon.com/ja_jp/cost-management/latest/userguide/budgets-action-configure.html)
- [GitHub Actions OIDC × Environments で複数 AWS アカウントへデプロイ（クラスメソッド）](https://dev.classmethod.jp/articles/ithub-actions-oidc-environments-multi-account-deploy/)
- [Amazon Bedrock Guardrails の日本語での設定と料金（一創）](https://www.issoh.co.jp/tech/details/4265/)
