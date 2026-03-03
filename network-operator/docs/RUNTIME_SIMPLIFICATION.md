# ClusterTrainingRuntime 簡化說明

## ✅ 可以移除的部分（由 Network Operator + Webhook 自動處理）

### 1. **NCCL 環境變數**（已由 Webhook 自動注入）
以下環境變數可以移除，因為 Webhook 會通過 `nccl-rdma-env` ConfigMap 自動注入：

```yaml
# ❌ 可以移除
- name: NCCL_IB_DISABLE
  value: '0'
- name: NCCL_IB_HCA
  value: ^mlx5_2,mlx5_3,mlx5_8,mlx5_9  # ⚠️ 硬編碼特定設備，不靈活
- name: NCCL_DEBUG
  value: INFO
- name: NCCL_DEBUG_SUBSYS
  value: ALL
- name: NCCL_TIMEOUT
  value: '1800'
- name: NCCL_BLOCKING_WAIT
  value: '1'
- name: NCCL_ASYNC_ERROR_HANDLING
  value: '1'
```

**原因**：
- Webhook 會自動為請求 GPU 的 Pod 注入 `nccl-rdma-env` ConfigMap 引用
- ConfigMap 中包含統一的 NCCL 配置（`NCCL_IB_DISABLE=0`, `NCCL_IB_HCA=mlx5`, `NCCL_DEBUG=INFO`）
- 這樣可以統一管理，不需要在每個 runtime 中硬編碼

### 2. **RDMA 資源請求**（已由 Webhook 自動注入）
- Webhook 會自動為請求 `nvidia.com/gpu` 的 Pod 注入 `rdma/rdma_shared_device_a: 1`
- 不需要在 runtime 中預先定義

## ⚠️ 需要保留的部分

### 1. **LD_LIBRARY_PATH**
```yaml
- name: LD_LIBRARY_PATH
  value: >-
    /opt/hpcx/nccl_rdma_sharp_plugin/lib:/usr/local/lib/python3.12/dist-packages/torch/lib:...
```
**原因**：這是運行時庫路徑，與 RDMA 設備無關，需要保留。

### 2. **Volume Mounts**
```yaml
volumeMounts:
  - mountPath: /dev/infiniband
    name: dev-infiniband
  - mountPath: /sys/class/infiniband
    name: sys-class-infiniband
    readOnly: true
  - mountPath: /dev/shm
    name: dshm
```
**原因**：
- RDMA Device Plugin 會分配設備，但不會自動掛載這些目錄
- 需要手動掛載 `/dev/infiniband` 和 `/sys/class/infiniband` 才能訪問 InfiniBand 設備
- `/dev/shm` 用於共享內存，PyTorch 分散式訓練需要

### 3. **SecurityContext**
```yaml
securityContext:
  capabilities:
    add:
      - IPC_LOCK
      - SYS_ADMIN
      - NET_ADMIN
  privileged: true
```
**原因**：訪問 InfiniBand 設備需要特權模式。

## 📝 簡化後的配置

見 `torch-distributed-simplified.yaml`

## 🔄 更新現有 Runtime

```bash
# 備份現有配置
kubectl get clustertrainingruntime torch-distributed -o yaml > torch-distributed-backup.yaml

# 應用簡化配置
kubectl apply -f torch-distributed-simplified.yaml
```

## ✅ 驗證

創建一個 TrainJob 後，檢查：
1. Pod 是否有 `rdma/rdma_shared_device_a` 資源請求（由 Webhook 注入）
2. Pod 的環境變數中是否有 NCCL 相關變數（來自 `nccl-rdma-env` ConfigMap）
3. Pod 是否能正常訪問 `/dev/infiniband` 設備

```bash
# 檢查 Pod 資源
kubectl get pod <pod-name> -o jsonpath='{.spec.containers[0].resources}'

# 檢查環境變數
kubectl exec <pod-name> -- env | grep NCCL

# 檢查設備
kubectl exec <pod-name> -- ls -la /dev/infiniband/
```

