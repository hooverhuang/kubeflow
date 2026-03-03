# NVIDIA Network Operator + RDMA Webhook + Kubeflow Runtime 部署指南

本倉庫包含完整的 RDMA 支援配置，用於 Kubeflow 分散式訓練。

## 📁 目錄結構

```
network-operator/
├── README.md                          # 本文件
├── nic-cluster-policy.yaml            # Network Operator 主配置（ConnectX-7）
├── torch-distributed-simplified.yaml  # 簡化後的 Kubeflow Runtime
├── webhook/                           # RDMA 自動注入 Webhook
│   ├── README.md
│   ├── DEPLOYMENT_GUIDE.md
│   ├── webhook.py                     # Webhook 核心邏輯
│   ├── rdma-auto-injector.yaml       # Webhook Kubernetes 資源
│   ├── deploy-webhook.sh              # 一鍵部署腳本
│   ├── generate-certs.sh              # TLS 證書生成
│   └── test-webhook.sh                # 測試腳本
└── docs/                              # 文檔
    ├── RUNTIME_SIMPLIFICATION.md     # Runtime 簡化說明
    └── CONNECTX7_NOTES.md            # ConnectX-7 特定配置
```

## 🚀 快速開始

### 1. 部署 Network Operator

```bash
# 方式 1: 使用 Helm（推薦）
helm repo add mellanox https://mellanox.github.io/network-operator
helm repo update
helm install network-operator mellanox/network-operator \
  --namespace nvidia-network-operator \
  --create-namespace

# 方式 2: 使用 make deploy
cd network-operator
make deploy
```

### 2. 配置 NicClusterPolicy

```bash
# 應用 Network Operator 配置
kubectl apply -f nic-cluster-policy.yaml

# 等待所有組件就緒
kubectl wait --for=condition=ready pod \
  -l app=ofed-driver \
  -n nvidia-network-operator \
  --timeout=300s
```

### 3. 部署 RDMA Webhook

```bash
cd webhook
./deploy-webhook.sh
```

Webhook 會自動：
- 為請求 GPU 的 Pod 注入 `rdma/rdma_shared_device_a` 資源
- 注入 NCCL 環境變數（通過 `nccl-rdma-env` ConfigMap）
- 在目標命名空間自動創建 ConfigMap（如果不存在）

### 4. 配置 Kubeflow Runtime

```bash
# 應用簡化後的 torch-distributed runtime
kubectl apply -f torch-distributed-simplified.yaml
```

## ✅ 驗證

### 檢查 Network Operator 狀態

```bash
# 檢查 NicClusterPolicy
kubectl get nicclusterpolicy nic-cluster-policy -o yaml

# 檢查 RDMA Device Plugin
kubectl get daemonset -n nvidia-network-operator -l app=rdma-shared-device-plugin

# 檢查設備資源
kubectl get nodes -o json | jq '.items[].status.allocatable | keys | .[]' | grep rdma
```

### 檢查 Webhook

```bash
# 檢查 Webhook Pod
kubectl get pods -n nvidia-network-operator -l app=rdma-auto-injector

# 檢查 Webhook 配置
kubectl get mutatingwebhookconfiguration rdma-auto-injector
```

### 測試 RDMA 功能

```bash
# 創建測試 Pod
kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: rdma-test
  namespace: default
spec:
  containers:
  - name: test
    image: ubuntu:22.04
    command: ["sleep", "infinity"]
    resources:
      requests:
        nvidia.com/gpu: 1
        rdma/rdma_shared_device_a: 1
      limits:
        nvidia.com/gpu: 1
        rdma/rdma_shared_device_a: 1
EOF

# 檢查 Pod 資源和環境變數
kubectl exec rdma-test -- env | grep NCCL
kubectl exec rdma-test -- ls -la /dev/infiniband/
```

## 📝 配置說明

### NicClusterPolicy (nic-cluster-policy.yaml)

- **OFED Driver**: Mellanox 網路驅動程式
- **RDMA Device Plugin**: 將 RDMA 設備暴露給 Kubernetes
- **CNI Plugins**: 支援次要網路（Multus 需單獨部署）
- **NVIDIA IPAM**: IP 地址管理（可選）

**重要配置**：
- 設備 ID: `1021` (ConnectX-7 主設備), `101e` (VF)
- 資源名稱: `rdma/rdma_shared_device_a`
- 鏡像倉庫: `nvcr.io/nvidia/mellanox`

### Webhook (webhook/)

自動注入機制：
1. 檢測 Pod 是否請求 `nvidia.com/gpu`
2. 自動添加 `rdma/rdma_shared_device_a: 1` 資源請求/限制
3. 自動注入 `nccl-rdma-env` ConfigMap 引用
4. 在目標命名空間自動創建 ConfigMap（如果不存在）

**NCCL 環境變數**（通過 ConfigMap）：
- `NCCL_IB_DISABLE=0`
- `NCCL_IB_HCA=mlx5`
- `NCCL_DEBUG=INFO`

### torch-distributed Runtime

簡化後的配置：
- ✅ 移除了硬編碼的 NCCL 環境變數（由 Webhook 自動注入）
- ✅ 保留了必要的 volume mounts 和 securityContext
- ✅ 保留了 `LD_LIBRARY_PATH`（運行時庫路徑）

## 🔧 故障排除

### Network Operator Pod CrashLoopBackOff

```bash
# 檢查 Multus CNI 配置
kubectl get configmap multus-cni-config -n kube-system -o yaml

# 檢查 CNI 衝突
kubectl describe pod <pod-name> -n nvidia-network-operator
```

### Webhook 無法注入資源

```bash
# 檢查 Webhook Pod 日誌
kubectl logs -n nvidia-network-operator -l app=rdma-auto-injector

# 檢查 Webhook 配置
kubectl get mutatingwebhookconfiguration rdma-auto-injector -o yaml

# 測試 Webhook
cd webhook
./test-webhook.sh
```

### RDMA 設備不可用

```bash
# 檢查 RDMA Device Plugin
kubectl get pods -n nvidia-network-operator -l app=rdma-shared-device-plugin

# 檢查節點資源
kubectl describe node <node-name> | grep rdma

# 檢查設備 ID 配置
kubectl get nicclusterpolicy nic-cluster-policy -o jsonpath='{.spec.rdmaSharedDevicePlugin.config}'
```

## 📚 相關文檔

- [Webhook 部署指南](webhook/DEPLOYMENT_GUIDE.md)
- [Runtime 簡化說明](docs/RUNTIME_SIMPLIFICATION.md)
- [ConnectX-7 配置說明](docs/CONNECTX7_NOTES.md)

## 🔗 參考資源

- [NVIDIA Network Operator](https://github.com/Mellanox/network-operator)
- [Kubeflow Training Operator](https://github.com/kubeflow/training-operator)
- [RDMA Device Plugin](https://github.com/Mellanox/k8s-rdma-shared-dev-plugin)

## 📄 許可證

本配置基於 NVIDIA Network Operator 和 Kubeflow，遵循相應的開源許可證。

