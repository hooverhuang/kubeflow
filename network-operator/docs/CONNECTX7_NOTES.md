# ConnectX-7 部署注意事項

## 設備資訊

根據檢測到的硬體：
- **設備型號**: Mellanox ConnectX-7 (MT2910 Family)
- **設備類型**: Infiniband 和 Ethernet 控制器
- **PCI Vendor ID**: 15b3 (Mellanox)
- **PCI Device IDs**:
  - `1021`: ConnectX-7 主設備 (Infiniband)
  - `101e`: ConnectX-7 Virtual Functions
  - `1021`: ConnectX-7 Ethernet 控制器

## ConnectX-7 特定配置

### 1. 驅動程式版本

ConnectX-7 需要較新的 OFED 驅動程式。確保使用支援 ConnectX-7 的版本：

```yaml
ofedDriver:
  version: doca3.2.0-25.10-1.2.8.0-2  # 確認此版本支援 ConnectX-7
```

### 2. RDMA 設備插件配置

已更新 `nic-cluster-policy.yaml` 以包含 ConnectX-7 的設備 ID：

```yaml
deviceIDs: ["1021", "101e"]
```

- `1021`: ConnectX-7 主設備
- `101e`: Virtual Functions

### 3. 多設備支援

如果節點有多個 ConnectX-7 設備，可以創建多個資源池：

```yaml
rdmaSharedDevicePlugin:
  config: |
    {
      "configList": [
        {
          "resourceName": "rdma_shared_device_cx7_1",
          "rdmaHcaMax": 63,
          "selectors": {
            "vendors": ["15b3"],
            "deviceIDs": ["1021", "101e"]
          }
        },
        {
          "resourceName": "rdma_shared_device_cx7_2",
          "rdmaHcaMax": 63,
          "selectors": {
            "vendors": ["15b3"],
            "deviceIDs": ["1021", "101e"]
          }
        }
      ]
    }
```

### 4. SR-IOV 配置（如果使用）

如果使用 SR-IOV，ConnectX-7 支援大量 VF：

```yaml
sriovDevicePlugin:
  config: |
    {
      "resourceList": [
        {
          "resourceName": "cx7_sriov",
          "selectors": {
            "vendors": ["15b3"],
            "devices": ["1021"],
            "drivers": ["mlx5_core"]
          }
        }
      ]
    }
```

## 驗證步驟

### 1. 檢查設備識別

```bash
# 在節點上檢查設備
lspci | grep -i mellanox

# 檢查設備 ID
lspci -n | grep 15b3

# 檢查 RDMA 設備
ibdev2netdev
ibstat
```

### 2. 檢查驅動程式載入

```bash
# 檢查 OFED 驅動 Pod
kubectl get pods -n network-operator-resources | grep ofed

# 查看驅動載入日誌
kubectl logs -n network-operator-resources <ofed-pod-name>
```

### 3. 測試 RDMA 功能

```bash
# 部署測試 Pod
kubectl apply -f example/rdma-test-pod1.yml

# 在 Pod 中測試
kubectl exec -it <pod-name> -- ibstat
kubectl exec -it <pod-name> -- ibdev2netdev
```

## 已知問題和限制

1. **驅動程式相容性**
   - 確保 OFED 版本支援 ConnectX-7
   - 某些舊版本可能不支援

2. **內核版本**
   - ConnectX-7 需要較新的內核（5.15+ 通常支援）
   - 你的環境: Ubuntu 22.04, kernel 5.15 ✅

3. **VF 數量限制**
   - ConnectX-7 支援大量 VF
   - 根據實際需求配置

## 效能優化建議

1. **MTU 設定**
   - Infiniband: 通常使用 4092 或 2044
   - Ethernet: 建議使用 9000 (Jumbo Frames)

2. **中斷親和性**
   - 配置 CPU 親和性以優化效能
   - 使用 numactl 綁定 NUMA 節點

3. **RDMA 佇列深度**
   - 根據應用需求調整 `rdmaHcaMax`

## 參考資源

- [ConnectX-7 產品頁面](https://www.nvidia.com/en-us/networking/ethernet-adapters/connectx-7/)
- [Mellanox OFED 文檔](https://docs.nvidia.com/networking/)
- [Network Operator 文檔](https://docs.nvidia.com/networking/software/cloud-orchestration/index.html)

