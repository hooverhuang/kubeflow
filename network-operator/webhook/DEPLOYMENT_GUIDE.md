# RDMA Auto Injector Webhook 部署指南

## 概述

這個 Webhook 會自動為請求 GPU 的 Pod 注入：
- `rdma/rdma_shared_device_a: 1` 資源
- NCCL 環境變數（從 `nccl-rdma-env` ConfigMap）

## 文件結構

```
webhook/
├── webhook.py                    # Webhook 核心邏輯
├── rdma-auto-injector.yaml      # Kubernetes 部署配置
├── generate-certs.sh            # TLS 證書生成腳本
├── deploy-webhook.sh            # 一鍵部署腳本
├── test-webhook.sh              # 測試腳本
├── README.md                    # 說明文檔
└── DEPLOYMENT_GUIDE.md          # 部署指南（本文件）
```

## 快速部署

### 方法 1: 使用一鍵部署腳本（推薦）

```bash
cd /root/network-operator/webhook
./deploy-webhook.sh
```

### 方法 2: 手動部署

#### 步驟 1: 生成 TLS 證書

```bash
cd /root/network-operator/webhook
./generate-certs.sh
```

#### 步驟 2: 創建 webhook.py ConfigMap

```bash
kubectl create configmap rdma-injector-script \
  --from-file=webhook.py=./webhook.py \
  -n nvidia-network-operator
```

#### 步驟 3: 部署 Webhook

```bash
kubectl apply -f rdma-auto-injector.yaml
```

#### 步驟 4: 驗證

```bash
# 檢查 Pod
kubectl get pods -n nvidia-network-operator -l app=rdma-auto-injector

# 檢查 Webhook 配置
kubectl get mutatingwebhookconfiguration rdma-auto-injector

# 查看日誌
kubectl logs -n nvidia-network-operator -l app=rdma-auto-injector
```

## 測試

### 測試 Webhook 是否正常工作

```bash
./test-webhook.sh
```

### 手動測試

```bash
# 創建測試 Pod
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

# 檢查是否自動注入了 RDMA
kubectl get pod test-pod -o jsonpath='{.spec.containers[0].resources}' | jq .

# 清理
kubectl delete pod test-pod
```

## 工作原理

1. **Pod 創建時**：Kubernetes API Server 調用 Webhook
2. **Webhook 檢查**：
   - Pod 是否請求了 `nvidia.com/gpu`
   - Pod 是否已經有 `rdma/rdma_shared_device_a` 資源
   - Pod 是否在排除的命名空間中
3. **自動注入**：
   - 添加 `rdma/rdma_shared_device_a: 1` 到 requests 和 limits
   - 添加 `envFrom` 引用 `nccl-rdma-env` ConfigMap
4. **返回修改後的 Pod**：API Server 使用修改後的配置創建 Pod

## 配置選項

修改 `rdma-injector-config` ConfigMap：

```bash
kubectl edit configmap rdma-injector-config -n nvidia-network-operator
```

可配置項：
- `rdmaResourceName`: RDMA 資源名稱（默認: `rdma/rdma_shared_device_a`）
- `rdmaResourceValue`: RDMA 資源值（默認: `1`）
- `configMapName`: NCCL ConfigMap 名稱（默認: `nccl-rdma-env`）
- `configMapNamespace`: ConfigMap 命名空間（默認: `default`）
- `excludeNamespaces`: 排除的命名空間列表

## 故障排除

### Webhook Pod 無法啟動

```bash
# 檢查 Pod 狀態
kubectl get pods -n nvidia-network-operator -l app=rdma-auto-injector

# 查看日誌
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

# 檢查 Webhook 日誌
kubectl logs -n nvidia-network-operator -l app=rdma-auto-injector
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
# 刪除 Webhook 配置
kubectl delete mutatingwebhookconfiguration rdma-auto-injector

# 刪除部署
kubectl delete -f rdma-auto-injector.yaml

# 刪除 ConfigMap 和 Secret
kubectl delete configmap rdma-injector-script -n nvidia-network-operator
kubectl delete secret rdma-injector-certs -n nvidia-network-operator
```

## 注意事項

1. **證書有效期**：默認證書有效期 365 天，需要定期更新
2. **性能影響**：Webhook 會增加 Pod 創建時間（通常 < 100ms）
3. **故障策略**：`failurePolicy: Fail` 表示如果 Webhook 失敗，Pod 創建會失敗
4. **命名空間**：默認排除系統命名空間，不會注入

## 最佳實踐

1. **監控**：監控 Webhook Pod 的健康狀態
2. **日誌**：定期檢查 Webhook 日誌
3. **測試**：在生產環境前先在測試環境驗證
4. **文檔**：告知用戶 Pod 會自動獲得 RDMA 資源

