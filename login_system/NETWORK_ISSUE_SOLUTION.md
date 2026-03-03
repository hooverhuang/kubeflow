# OpenLDAP 網絡連接問題解決方案

## 問題分析

- OpenLDAP 運行在 **hgpn108 (10.2.1.108)** 的 Docker 容器中
- Dex Pod 運行在 **hgpn76** 節點上
- Kubernetes Pod 無法跨節點訪問主機的 Docker 容器端口

## 解決方案

### 方案 1：將 OpenLDAP 部署到 Kubernetes（推薦）

優點：
- 網絡互通性好
- 易於管理和擴展
- 與 Kubernetes 生態整合

缺點：
- 需要遷移現有數據

### 方案 2：使用主機網絡模式部署 OpenLDAP Pod 到 hgpn108

優點：
- 保持數據在原節點
- 使用現有 Docker 數據卷

### 方案 3：配置 NodePort 或直接使用節點 IP（臨時方案）

使用 hgpn108 的 Kubernetes 內部 IP


