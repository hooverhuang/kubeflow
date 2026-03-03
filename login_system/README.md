# Kubeflow Login System - Auth Proxy Architecture

## 架構概述

```
用戶登入流程：
Kubeflow → Dex → Auth Proxy (OIDC Provider)
                    ↓
            ┌───────┴───────┐
            │               │
        MySQL (bcrypt)   OpenLDAP
        (驗證密碼)      (查詢用戶信息)
```

## 系統架構

### 認證流程

1. **用戶訪問 Kubeflow** → 被重定向到 Dex
2. **Dex** → 提供 Connector 選擇（Billing Auth / Authentik）
3. **選擇 Billing Auth** → 重定向到 Auth Proxy
4. **Auth Proxy** → 
   - 顯示登入頁面（UBILINK Logo + 表單）
   - 驗證 MySQL bcrypt 密碼
   - 查詢 OpenLDAP 獲取用戶信息（組、角色等）
   - 生成 JWT Token (RS256)
5. **返回 Dex** → 使用 Token 獲取用戶信息
6. **登入成功** → 訪問 Kubeflow

### 登出流程

1. **用戶點擊登出** → 清除 OAuth2 Proxy cookies
2. **重定向到 Auth Proxy `/end-session`** → 清除 Flask session 和瀏覽器 cookies
3. **重定向回 Kubeflow** → 需要重新登入

## 核心組件

### 1. Auth Proxy (OIDC Provider)

**位置**: `auth-proxy/app.py`

**功能**:
- 提供 OIDC Discovery 端點 (`/.well-known/openid-configuration`)
- 提供授權端點 (`/authorize`) - 顯示登入頁面
- 提供 Token 端點 (`/token`) - 交換授權碼為 JWT
- 提供 UserInfo 端點 (`/userinfo`) - 返回用戶信息
- 提供 End Session 端點 (`/end-session`) - 處理登出
- 提供 JWKS 端點 (`/.well-known/jwks.json`) - 提供公鑰

**認證方式**:
- MySQL `auth.users` 表驗證 bcrypt 密碼
- OpenLDAP 查詢用戶信息（不驗證密碼）

**部署**:
- Namespace: `auth`
- Service: `auth-proxy` (NodePort: 30180)
- ConfigMap: `auth-proxy-app-code` (包含 app.py)
- ConfigMap: `auth-proxy-static` (包含 logo 圖片)

**登入頁面特性**:
- UBILINK Logo (`/static/images/logoblack.png`)
- 亮灰色背景 (`#e5e7eb`)
- Bootstrap 5.3.0 UI
- 響應式設計

### 2. Dex (OIDC Client)

**配置**: `dex-configmap-with-authproxy.yaml`

**Connectors**:
1. **Billing Auth** (auth-proxy)
   - Type: OIDC
   - Issuer: `https://kubeflowlogin.ubilink.ai`
   - Client ID: `kubeflow-auth-proxy`
   - Redirect URI: `https://kubeflow.ubilink.ai/dex/callback`

2. **Authentik** (可選)
   - Type: OIDC
   - Issuer: `https://authentik.ubilink.ai/application/o/kubeflow-dex/`

**部署**:
- Namespace: `auth`
- ConfigMap: `dex`

### 3. MySQL

**用途**: 存儲用戶帳號和 bcrypt 密碼哈希

**表結構** (`auth.users`):
- `email`: 用戶郵箱（主鍵）
- `password`: bcrypt 哈希密碼
- `name`: 用戶名稱
- `role`: 用戶角色
- `status`: 用戶狀態（active/inactive）

**連接信息**:
- Host: `10.2.240.11:3306`
- Database: `auth`
- User: `usagereportdb`

### 4. OpenLDAP

**用途**: 查詢用戶信息（組、角色等），不驗證密碼

**配置**:
- Server: `openldap.auth.svc.cluster.local:389`
- Base DN: `dc=ubilink,dc=ai`
- Users DN: `ou=users,dc=ubilink,dc=ai`
- Admin DN: `cn=admin,dc=ubilink,dc=ai`
- Admin Password: `admin123`

**同步服務**:
- `mysql-ldap-sync.py`: 每 5 分鐘從 MySQL 同步用戶到 OpenLDAP
- 僅同步用戶信息，不處理密碼（密碼在 MySQL 中為 bcrypt）

## 文件結構

```
login_system/
├── auth-proxy/
│   ├── app.py                    # Auth Proxy 主程序
│   ├── static/
│   │   └── images/
│   │       └── logoblack.png     # UBILINK Logo
│   ├── requirements.txt          # Python 依賴
│   └── Dockerfile               # Docker 構建文件（可選）
├── dex-configmap-with-authproxy.yaml  # Dex 配置（包含 Auth Proxy connector）
├── apply-authproxy-architecture.sh    # 部署 Auth Proxy 架構腳本
├── rollback-authproxy.sh             # 回滾 Auth Proxy 配置
├── mysql-ldap-sync.py               # MySQL 到 OpenLDAP 同步腳本
├── mysql-ldap-sync-deployment.yaml  # 同步服務部署配置
├── openldap-service.yaml            # OpenLDAP Kubernetes Service
└── README.md                        # 本文檔
```

## 部署步驟

### 1. 部署 Auth Proxy

```bash
# 創建 ConfigMap（包含 app.py）
kubectl create configmap auth-proxy-app-code -n auth \
  --from-file=app.py=auth-proxy/app.py

# 創建 ConfigMap（包含 logo）
kubectl create configmap auth-proxy-static -n auth \
  --from-file=logoblack.png=auth-proxy/static/images/logoblack.png

# 部署 Auth Proxy（參考 auth-proxy-deployment.yaml）
kubectl apply -f auth-proxy-deployment.yaml

# 或使用部署腳本
./apply-authproxy-architecture.sh
```

### 2. 配置 Dex

```bash
# 應用 Dex 配置（包含 Auth Proxy connector）
kubectl apply -f dex-configmap-with-authproxy.yaml

# 重啟 Dex Pod
kubectl rollout restart deployment dex -n auth
```

### 3. 配置 Central Dashboard Logout URL

```bash
# 設置登出後重定向到 Auth Proxy end-session
kubectl patch deployment centraldashboard -n kubeflow --type='json' -p='[
  {
    "op": "replace",
    "path": "/spec/template/spec/containers/0/env",
    "value": [
      {
        "name": "LOGOUT_URL",
        "value": "/oauth2/sign_out?rd=https%3A%2F%2Fkubeflowlogin.ubilink.ai%2Fend-session%3Fpost_logout_redirect_uri%3Dhttps%253A%252F%252Fkubeflow.ubilink.ai%252F"
      }
    ]
  }
]'
```

### 4. 部署 MySQL 同步服務（可選）

```bash
# 部署同步服務（每 5 分鐘同步用戶到 OpenLDAP）
kubectl apply -f mysql-ldap-sync-configmap.yaml
kubectl apply -f mysql-ldap-sync-deployment.yaml
```

## 配置信息

### Auth Proxy

- **Service**: `auth-proxy.auth.svc.cluster.local:8080`
- **Service URL**: `https://kubeflowlogin.ubilink.ai`
- **OIDC Issuer**: `https://kubeflowlogin.ubilink.ai`
- **Client ID**: `kubeflow-auth-proxy`
- **JWT Algorithm**: RS256

### MySQL

- **Host**: `10.2.240.11:3306`
- **Database**: `auth`
- **Table**: `users`
- **Password Hash**: bcrypt

### OpenLDAP

- **Server**: `openldap.auth.svc.cluster.local:389`
- **Base DN**: `dc=ubilink,dc=ai`
- **Users DN**: `ou=users,dc=ubilink,dc=ai`
- **Bind DN**: `cn=admin,dc=ubilink,dc=ai`
- **Bind Password**: `admin123`

### Dex

- **Namespace**: `auth`
- **Issuer**: `https://kubeflow.ubilink.ai/dex`
- **ConfigMap**: `dex`

## 測試

### 測試 Auth Proxy

```bash
# 檢查 OIDC Discovery
curl https://kubeflowlogin.ubilink.ai/.well-known/openid-configuration

# 檢查 JWKS
curl https://kubeflowlogin.ubilink.ai/.well-known/jwks.json

# 檢查登入頁面
curl https://kubeflowlogin.ubilink.ai/authorize?client_id=kubeflow-auth-proxy&redirect_uri=https://kubeflow.ubilink.ai/dex/callback
```

### 測試登入流程

1. 訪問 `https://kubeflow.ubilink.ai`
2. 選擇 "Billing Auth" connector
3. 輸入 MySQL 中的用戶郵箱和密碼
4. 驗證登入成功

### 測試登出流程

1. 登入後點擊登出按鈕
2. 驗證被重定向到 Auth Proxy end-session
3. 驗證 session 和 cookies 被清除
4. 驗證重定向回 Kubeflow 後需要重新登入

## 故障排除

### Auth Proxy 無法連接 MySQL

```bash
# 檢查 Pod 是否在正確的節點上（需要能訪問 MySQL）
kubectl get pods -n auth -l app=auth-proxy -o wide

# 檢查 MySQL 連接
kubectl exec -n auth <auth-proxy-pod> -- python -c "
import pymysql
conn = pymysql.connect(host='10.2.240.11', port=3306, user='usagereportdb', password='<password>', database='auth')
print('MySQL connection OK')
"
```

### Auth Proxy 無法連接 OpenLDAP

```bash
# 檢查 OpenLDAP Service
kubectl get svc -n auth openldap

# 測試連接
kubectl exec -n auth <auth-proxy-pod> -- python -c "
from ldap3 import Server, Connection
server = Server('openldap.auth.svc.cluster.local', port=389)
conn = Connection(server, 'cn=admin,dc=ubilink,dc=ai', 'admin123', auto_bind=True)
print('LDAP connection OK')
"
```

### 登入頁面 Logo 不顯示

```bash
# 檢查 static ConfigMap
kubectl get configmap auth-proxy-static -n auth

# 檢查 Pod 中的文件
kubectl exec -n auth <auth-proxy-pod> -- ls -la /app/static/images/

# 檢查 Flask static 配置
kubectl exec -n auth <auth-proxy-pod> -- grep -A 2 "static_folder" /app/app.py
```

## 更新日誌

### 2026-01-13
- ✅ 添加 UBILINK Logo 到登入頁面
- ✅ 調整背景色為亮灰色 (`#e5e7eb`)
- ✅ 優化登入頁面 UI 樣式（參考 resource-quota-manager）
- ✅ 配置 Flask static 文件夾支持
- ✅ 實現強制登出後重新登入機制

### 2026-01-12
- ✅ 實現 Auth Proxy OIDC Provider
- ✅ 配置 Dex 連接 Auth Proxy
- ✅ 實現 MySQL bcrypt 密碼驗證
- ✅ 實現 OpenLDAP 用戶信息查詢
- ✅ 實現登出流程和 session 清除

## 相關文檔

- `AUTHPROXY_ARCHITECTURE.md`: Auth Proxy 架構詳細說明
- `DEX_LDAP_SETUP.md`: Dex LDAP 配置說明（舊架構）
- `MANUAL_TEST_STEPS.md`: 手動測試步驟

## 注意事項

⚠️ **重要**:
- Auth Proxy 的 `/authorize` 端點會**強制清除 session**，確保每次都需要重新登入
- 登出流程會清除所有 cookies（包括 Flask session 和瀏覽器 cookies）
- MySQL 密碼必須是 bcrypt 格式
- OpenLDAP 僅用於查詢用戶信息，不驗證密碼

## 維護

### 更新 Auth Proxy 代碼

```bash
# 更新 ConfigMap
kubectl create configmap auth-proxy-app-code -n auth \
  --from-file=app.py=auth-proxy/app.py \
  --dry-run=client -o yaml | kubectl apply -f -

# 重啟 Deployment
kubectl rollout restart deployment auth-proxy -n auth
```

### 回滾配置

```bash
# 回滾 Auth Proxy
./rollback-authproxy.sh

# 回滾 Dex
./rollback-dex.sh
```
