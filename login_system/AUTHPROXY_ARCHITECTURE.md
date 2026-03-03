# Auth Proxy 架構說明

## 架構流程

```
用戶登錄 Kubeflow
  ↓
Dex → OIDC Connector → Auth Proxy
                          ↓
                      驗證 MySQL bcrypt 密碼 ✅
                          ↓
                      發放 JWT/OIDC Token
  ↓
Dex 收到 Token
  ↓
Dex → LDAP Connector (只讀) → 查詢用戶信息和組
  ↓
返回完整用戶信息給 Kubeflow
```

## 組件說明

### 1. Auth Proxy
- **功能**: OIDC Provider，驗證 MySQL bcrypt 密碼
- **端點**:
  - `/authorize` - OIDC 授權端點
  - `/token` - Token 發放端點
  - `/userinfo` - 用戶信息端點
- **驗證**: MySQL bcrypt 密碼驗證

### 2. Dex OIDC Connector
- **功能**: 連接到 Auth Proxy，處理 OIDC 流程
- **配置**: `dex-configmap-with-authproxy.yaml`

### 3. Dex LDAP Connector (只讀)
- **功能**: 只查詢用戶信息和組，不驗證密碼
- **配置**: 使用 admin 帳號 bind，只讀取用戶數據

## 部署步驟

### 1. 部署 Auth Proxy

```bash
cd /root/login_system
kubectl apply -f auth-proxy/auth-proxy-deployment.yaml
```

### 2. 構建 Auth Proxy 鏡像（如果需要）

```bash
cd auth-proxy
docker build -t auth-proxy:latest .
# 推送到鏡像倉庫或使用本地鏡像
```

### 3. 應用 Dex 配置

```bash
./apply-authproxy-architecture.sh
```

### 4. 如果出現問題，回滾

```bash
./rollback-authproxy.sh
```

## 配置說明

### Auth Proxy 環境變量

- `MYSQL_HOST`: MySQL 主機地址
- `MYSQL_PORT`: MySQL 端口
- `MYSQL_DB`: 數據庫名稱
- `MYSQL_USER`: MySQL 用戶名
- `MYSQL_PASSWORD`: MySQL 密碼（從 Secret 讀取）
- `OIDC_CLIENT_ID`: OIDC Client ID
- `OIDC_CLIENT_SECRET`: OIDC Client Secret（從 Secret 讀取）
- `OIDC_ISSUER`: OIDC Issuer URL

### Dex 配置變更

1. **新增 Auth Proxy OIDC Connector**:
   - ID: `auth-proxy`
   - Name: `Billing Auth`
   - Issuer: `http://auth-proxy.auth.svc.cluster.local:8080`

2. **修改 LDAP Connector**:
   - ID: `openldap-readonly`
   - Name: `OpenLDAP (Read Only)`
   - 不進行密碼驗證，只用於查詢

## 測試步驟

1. 訪問 Kubeflow 登錄頁面
2. 選擇 "Billing Auth" 登錄方式
3. 輸入 MySQL 中的用戶名和密碼（bcrypt 格式）
4. 登錄成功後，Dex 會從 LDAP 查詢用戶信息和組

## 故障排除

### Auth Proxy 無法連接 MySQL
- 檢查 MySQL 連接配置
- 檢查網絡策略

### Dex 無法連接 Auth Proxy
- 檢查 Auth Proxy 服務是否運行
- 檢查 Service 和 Endpoints

### LDAP 查詢失敗
- 檢查 OpenLDAP 服務
- 檢查 LDAP 連接配置

## 安全注意事項

1. **Secret 管理**: 確保 `auth-proxy-secret` 和 `mysql-auth-secret` 使用強密碼
2. **TLS**: 建議為 Auth Proxy 配置 TLS
3. **網絡策略**: 限制 Auth Proxy 的網絡訪問


