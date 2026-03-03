# RDMA Auto Injector Webhook

自動為請求 GPU 的 Pod 注入 RDMA 資源和 NCCL 環境變數。

## 功能

當 Pod 請求 `nvidia.com/gpu` 資源時，自動：
- 添加 `rdma/rdma_shared_device_a: 1` 資源請求
- 添加 `rdma/rdma_shared_device_a: 1` 資源限制
- 注入 NCCL 環境變數（從 `nccl-rdma-env` ConfigMap）

## 文件說明

- `webhook.py`: Webhook 核心邏輯（Python）
- `rdma-auto-injector.yaml`: Kubernetes 部署配置
- `generate-certs.sh`: TLS 證書生成腳本
- `deploy-webhook.sh`: 一鍵部署腳本

## 快速部署

```bash
cd /root/network-operator/webhook
./deploy-webhook.sh
```

## 手動部署步驟

### 1. 確保 ConfigMap 存在

```bash
kubectl get configmap nccl-rdma-env -n default
# 如果不存在，會自動創建
```

### 2. 生成 TLS 證書

```bash
./generate-certs.sh
```

### 3. 創建 webhook.py ConfigMap

```bash
kubectl create configmap rdma-injector-script \
  --from-file=webhook.py=./webhook.py \
  -n nvidia-network-operator
```

### 4. 部署 Webhook

```bash
kubectl apply -f rdma-auto-injector.yaml
```

### 5. 驗證

```bash
# 檢查 Pod
kubectl get pods -n nvidia-network-operator -l app=rdma-auto-injector

# 檢查 Webhook 配置
kubectl get mutatingwebhookconfiguration rdma-auto-injector

# 查看日誌
kubectl logs -n nvidia-network-operator -l app=rdma-auto-injector
```

## 測試

創建一個測試 Pod：

```bash
kubectl run test-pod --image=pytorch/pytorch:latest \
  --overrides='
{
  "spec": {
    "containers": [{
      "name": "test",
      "resources": {
        "requests": {"nvidia.com/gpu": "1"}
      }
    }]
  }
}'
```

檢查 Pod 是否自動注入了 RDMA 資源：

```bash
kubectl get pod test-pod -o jsonpath='{.spec.containers[0].resources}' | jq .
```

應該看到：
```json
{
  "requests": {
    "nvidia.com/gpu": "1",
    "rdma/rdma_shared_device_a": "1"  // 自動注入
  },
  "limits": {
    "rdma/rdma_shared_device_a": "1"  // 自動注入
  }
}
```

## 配置

修改 `rdma-injector-config` ConfigMap 來調整行為：

```yaml
rdmaResourceName: "rdma/rdma_shared_device_a"
rdmaResourceValue: "1"
configMapName: "nccl-rdma-env"
configMapNamespace: "default"
excludeNamespaces:
  - kube-system
  - kube-public
```

## 故障排除

### Webhook Pod 無法啟動

```bash
# 檢查日誌
kubectl logs -n nvidia-network-operator -l app=rdma-auto-injector

# 檢查證書
kubectl get secret rdma-injector-certs -n nvidia-network-operator
```

### Pod 沒有被注入

```bash
# 檢查 Webhook 配置
kubectl get mutatingwebhookconfiguration rdma-auto-injector -o yaml

# 檢查 Pod 事件
kubectl describe pod <pod-name>
```

### 證書問題

```bash
# 重新生成證書
./generate-certs.sh
# 重啟 Pod
kubectl delete pod -n nvidia-network-operator -l app=rdma-auto-injector
```

## 卸載

```bash
kubectl delete mutatingwebhookconfiguration rdma-auto-injector
kubectl delete -f rdma-auto-injector.yaml
kubectl delete configmap rdma-injector-script -n nvidia-network-operator
kubectl delete secret rdma-injector-certs -n nvidia-network-operator
```

