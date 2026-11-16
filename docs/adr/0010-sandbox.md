# ADR-010 アプリ実行サンドボックス（Kubernetes＋gVisor）

ステータス: Proposed（方向性は「Kubernetes経由でgVisorを使う」。ローカルのK8sとアプリの載せ方が未決定）

## 要約

- APIやWebページ（AIが生成したものを含む）を、隔離した環境で動かす基盤を作る
- 方向性は「Kubernetes上で、アプリのPodだけをgVisorで動かす」
- ローカルのKubernetesの選び方と、アプリの載せ方はまだ決めていない

## 背景

プラットフォームの上で、AIが生成したAPIやWebページを試しに動かしたい。生成されたコードは中身を信用できない。素のコンテナはホストとカーネルを共有するため、コンテナの外へ抜け出す脆弱性があるとホストまで影響が及ぶ。

隔離の強さには段階がある。

- 素のコンテナ：プロセスと名前空間の分離だけ。カーネルは共有
- gVisor：コンテナとホストの間に、Goで書かれたユーザー空間のカーネル（Sentry）を挟む。アプリのシステムコールをgVisorが受け、ホストに届く呼び出しを絞る
- 軽量VM（Firecracker、Kata Containers）：コンテナごとに仮想マシンを立てる。隔離は最も強いが、入れ子の仮想化が要る

nono（ADR-012）はコマンドやエージェントの実行を囲うもので、サーバーを並べて動かす用途には向かない。Kubernetesに載せれば、ゲートウェイ（ADR-002）も同じクラスターで学べる。詳しくは[サンドボックスの解説](../components/sandbox.md)を参照。

## 決まっている方向性

- PodごとにRuntimeClass（`runtimeClassName: gvisor`、handlerは`runsc`）を指定し、アプリだけgVisorで動かす。ゲートウェイや観測系は通常のランタイムのまま
- 外への通信はNetworkPolicyでAIゲートウェイなど許可先に限る。外からはIngress経由だけ
- 実AWSではEKSのマネージドノードグループに、起動テンプレートのユーザーデータでrunscを入れる。EKS Auto ModeはgVisorに対応していない

## 選択肢1: ローカルのKubernetes

開発マシンはMac（M2、arm64）。gVisorはLinuxのカーネル上で動くので、どの案もLinux VMの中で動かす。gVisor自体はarm64に対応している。FirecrackerやKataは入れ子の仮想化が要るため、Macでは候補にしない。

| 案 | 内容 | 長所 | 短所 |
| --- | --- | --- | --- |
| A | minikube（Dockerドライバー、containerd）＋gVisorアドオン | アドオンはarm64に対応済みで、有効にするだけでRuntimeClassまで作られる。まず動かすには最速 | アドオン任せでEKSで必要な手順を踏まない。過去にcontainerdの設定形式の変更で壊れたことがある |
| B | Lima（Ubuntu arm64のVM）上のk3sにrunscを自分で入れる | containerdへの登録からRuntimeClassまで、EKSのノードと同じ手順を踏める | 手順が多い。k3sのcontainerd設定はテンプレートで書く必要がある |
| C | kind | CIで使いやすい | gVisorを組み込む手順は未確認 |

**推奨**：Aで動作を確かめ、学習の本番はBにする。Bの手順はそのままEKSのノード設定（ユーザーデータ）に移せる。

## 選択肢2: アプリの載せ方

| 案 | 内容 | 長所 | 短所 |
| --- | --- | --- | --- |
| A | 通常のDeployment＋Service＋IngressにRuntimeClassを指定 | 標準の部品だけで済む | アプリごとの生成・破棄は自分で作る |
| B | Agent Sandbox（kubernetes-sigs）のSandbox CRD | アプリ1つ＝Sandbox 1つで扱え、テンプレート、ウォームプール、休止・再開がある。AWSのEKS向け参考構成もある | SIG Appsで開発中のプロジェクトで、APIが変わりうる |

## 他のADRへの影響

- ADR-002：Kubernetesを使うなら、Envoy AI Gatewayも現実的な候補になる
- ADR-006：Kubernetesのマニフェストの管理方法（Terraformから扱うか、別のツールにするか）。AWS EmulatorはAWSのAPIを再現するもので、Podを動かすクラスターにはならない想定。K8s部分のCI検証はローカルのクラスターで行う
- ADR-007：実AWS段にEKSが入るとコストが増える。立てて壊す前提を守る

## 判断材料・確認すること

- [ ] Macのメモリが足りるか（Linux VM、K8s、Langfuse、Ollama、AWS Emulatorを同時に動かす）
- [ ] 選んだローカルK8sでgVisorのRuntimeClassが動くか（`uname`でgVisorのカーネル表示になるか）
- [ ] 動かしたいアプリ（Webフレームワーク）がgVisor上で問題なく動くか
- [ ] EKSでの初回起動の遅さ（ノードごとの最初のPodは60〜90秒程度という報告がある）
- [ ] EKSのノードをarm64（Graviton）にして、ローカルとCPUアーキテクチャを揃えるか

## 決定

未定。

## 参考資料

- [Running Agents on Kubernetes with Agent Sandbox（Kubernetes Blog）](https://kubernetes.io/blog/2026/03/20/running-agents-on-kubernetes-with-agent-sandbox)
- [Agent Sandbox Docs](https://agent-sandbox.sigs.k8s.io/docs/)
- [Agent Sandbox on EKS（AI on EKS）](https://awslabs.github.io/ai-on-eks/docs/infra/agents/agent-sandbox)
- [How to Set Up gVisor on AWS EKS（DevOpsCube）](https://devopscube.com/set-up-gvisor-on-aws-eks/)
- [gVisor on K3s（gist）](https://gist.github.com/Frichetten/c77ee24b12edd2ab852738fc8221a1f1)
- [Fly.io: Firecracker vs gVisor](https://fly.io/learn/firecracker-vs-gvisor/)
