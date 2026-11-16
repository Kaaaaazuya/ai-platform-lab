# サンドボックス（Kubernetes＋gVisor）

!!! note "予定"
    まだ実装していない。方針はADR-010で検討中。

## ひとことで

AIが生成したAPIやWebページを、ホストから隔離して動かすための実行基盤。Kubernetes の上で、アプリのPodだけを gVisor という仕組みで動かす。

## このリポジトリでの役割（予定）

| 項目 | 内容 |
| --- | --- |
| ローカルのKubernetes | minikube（まず動かす）、または Lima 上の k3s（EKSと同じ手順を学ぶ） |
| 隔離の仕組み | gVisor（`runsc`）を RuntimeClass で指定する |
| 実AWS | EKS のマネージドノードグループに runsc を入れる |
| 関連ADR | [ADR-010](../adr/0010-sandbox.md)、[ADR-012](../adr/0012-software-factory.md) |

## 仕組み

### コンテナの隔離の段階

| 方式 | 仕組み | 隔離の強さ | 重さ |
| --- | --- | --- | --- |
| 素のコンテナ | 名前空間と cgroup でプロセスを分ける。カーネルはホストと共有 | 弱い | 軽い |
| gVisor | ユーザー空間のカーネル（Sentry）がシステムコールを受け、ホストへの呼び出しを絞る | 中程度 | 中程度 |
| 軽量VM（Firecracker、Kata） | コンテナごとに仮想マシンを立てる | 強い | 重い（入れ子の仮想化が要る） |

### gVisor の仕組み

普通のコンテナでは、アプリのシステムコールがそのままホストのカーネルに届く。gVisor では、間に入った Sentry がシステムコールを受け取り、自分で処理する。ホストのカーネルに届くのは、Sentry が必要とする一部の呼び出しだけになる。カーネルの脆弱性を突かれても、ホストまで届きにくい。

代わりに、システムコールが多いアプリ（ファイルの読み書きやネットワークが多いもの）は遅くなる。

### Kubernetes での指定

RuntimeClass という仕組みで、Pod ごとに使うランタイムを選べる。

```yaml
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: gvisor
handler: runsc
---
apiVersion: v1
kind: Pod
spec:
  runtimeClassName: gvisor
```

ゲートウェイや観測系は普通のランタイムのまま動かし、信用できないアプリだけを gVisor にする。

### Mac で動かすときの制約

gVisor は Linux のカーネルの上で動く。Mac では Linux の仮想マシン（Docker Desktop、Lima など）の中で動かすことになる。Firecracker や Kata は仮想マシンの中でさらに仮想化が要るため、Mac では候補にしていない。

## 学ぶポイント

- コンテナの隔離の仕組みと限界
- Kubernetes の RuntimeClass、NetworkPolicy（外への通信を絞る）
- ローカルのクラスターとEKSで、同じ手順を踏めるようにする設計

## つまずきやすい点

- containerd の設定の書き方が版によって変わる。手順をそのまま写すと動かないことがある
- EKS Auto Mode は gVisor に対応していない（ADR-010）
- Mac のメモリは、Kubernetes、Langfuse、Ollama を同時に動かすと足りなくなりやすい

## 参考資料

- [gVisor](https://gvisor.dev/)
- [Kubernetes: Runtime Class](https://kubernetes.io/docs/concepts/containers/runtime-class/)
- [Agent Sandbox Docs](https://agent-sandbox.sigs.k8s.io/docs/)
