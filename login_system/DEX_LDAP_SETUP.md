# Dex LDAP 連接器配置指南

## 概述

本指南說明如何配置 Dex 直接連接到 OpenLDAP，繞過 Keycloak。

## 架構變更

### 原架構
```
MySQL → OpenLDAP → Keycloak → Dex → Kubeflow
```

### 新架構（配置後）
```
MySQL → OpenLDAP → Dex → Kubeflow
```

## 安全注意事項

⚠️ **重要警告**：
- 當前配置使用 **389 端口（非 TLS）**，密碼以明文傳輸
- 根據 [Dex 官方文檔](https://dexidp.io/docs/connectors/ldap/)，使用 389 端口會洩露密碼
- 建議未來升級到 **636 端口（LDAPS）** 或使用 **StartTLS**

## 配置詳情

### OpenLDAP 連接信息
- **地址**: `10.2.1.108:389`
- **Base DN**: `dc=ubilink,dc=ai`
- **Users DN**: `ou=users,dc=ubilink,dc=ai`
- **Bind DN**: `cn=admin,dc=ubilink,dc=ai`
- **Bind Password**: `admin123`

### Dex LDAP 連接器配置

根據 [Dex LDAP 文檔](https://dexidp.io/docs/connectors/ldap/)，配置了以下內容：

1. **用戶搜索**：
   - Base DN: `ou=users,dc=ubilink,dc=ai`
   - 過濾器: `(objectClass=inetOrgPerson)`
   - 用戶名屬性: `uid`（對應 email）
   - 郵箱屬性: `mail`
   - 顯示名稱: `cn`

2. **組搜索**：
   - 當前未配置（如果 LDAP 中有組，可以後續添加）

## 部署步驟

### 1. 備份現有配置（已自動完成）

腳本會自動備份現有配置到 `dex-configmap-backup-*.yaml`

### 2. 應用新配置

```bash
cd /root/login_system
./apply-dex-ldap.sh
```

這個腳本會：
- ✅ 再次備份當前配置
- ✅ 驗證配置文件格式
- ✅ 應用新配置
- ✅ 等待 Pod 重啟
- ✅ 顯示日誌

### 3. 測試連接

```bash
./test-dex-ldap.sh
```

### 4. 如果出現問題，回滾

```bash
./rollback-dex.sh
```

## 驗證步驟

### 1. 檢查 Dex Pod 狀態
```bash
kubectl get pods -n auth -l app=dex
```

### 2. 檢查 Dex 日誌
```bash
kubectl logs -n auth -l app=dex --tail=50 | grep -i ldap
```

### 3. 測試登錄
1. 訪問 Kubeflow 登錄頁面
2. 應該能看到 "OpenLDAP" 登錄選項
3. 使用 OpenLDAP 中的用戶憑證登錄（例如：`hoover2274@gmail.com`）

## 故障排除

### 問題 1: Dex Pod 無法啟動

**檢查**：
```bash
kubectl logs -n auth -l app=dex --tail=100
```

**可能原因**：
- 配置文件格式錯誤
- OpenLDAP 連接失敗

**解決**：
- 使用 `rollback-dex.sh` 回滾
- 檢查 OpenLDAP 是否可訪問：`nc -zv 10.2.1.108 389`

### 問題 2: 無法連接到 OpenLDAP

**檢查**：
```bash
# 從 Dex Pod 測試連接
kubectl exec -n auth -l app=dex -- nc -zv 10.2.1.108 389
```

**可能原因**：
- OpenLDAP 服務未運行
- 網絡策略阻止連接
- IP 地址錯誤

### 問題 3: 用戶無法登錄

**檢查**：
1. 確認用戶在 OpenLDAP 中存在：
   ```bash
   docker exec openldap ldapsearch -x -H ldap://localhost:1389 \
     -b "ou=users,dc=ubilink,dc=ai" \
     -D "cn=admin,dc=ubilink,dc=ai" \
     -w admin123 \
     "(uid=用戶email)"
   ```

2. 檢查 Dex 日誌中的錯誤信息

3. 確認用戶屬性配置正確（uid, mail, cn）

## 配置參考

### 完整的 Dex LDAP 連接器配置

```yaml
- type: ldap
  id: openldap
  name: OpenLDAP
  config:
    host: 10.2.1.108:389
    insecureNoSSL: true  # ⚠️ 不安全，建議升級到 LDAPS
    bindDN: cn=admin,dc=ubilink,dc=ai
    bindPW: admin123
    usernamePrompt: Email Address
    userSearch:
      baseDN: ou=users,dc=ubilink,dc=ai
      filter: "(objectClass=inetOrgPerson)"
      username: uid
      idAttr: uid
      emailAttr: mail
      nameAttr: cn
      preferredUsernameAttr: uid
```

## 未來改進

1. **升級到 LDAPS**：
   - 配置 OpenLDAP 使用 TLS
   - 將端口改為 636
   - 移除 `insecureNoSSL: true`
   - 添加 `rootCA` 證書配置

2. **添加組支持**：
   - 如果 LDAP 中有組信息，可以配置 `groupSearch`

3. **使用 Kubernetes Service**：
   - 如果 OpenLDAP 在集群內，可以使用 Service 名稱而不是 IP

## 相關文檔

- [Dex LDAP 連接器官方文檔](https://dexidp.io/docs/connectors/ldap/)
- [Dex 配置文檔](https://dexidp.io/docs/configuration/)


