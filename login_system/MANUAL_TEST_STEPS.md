# Keycloak LDAP 連接手動測試步驟

## 前置檢查

### 1. 確認 OpenLDAP 運行正常
```bash
docker ps | grep openldap
```

### 2. 確認 OpenLDAP 中有用戶
```bash
docker exec openldap ldapsearch -x -H ldap://localhost:1389 \
  -b "ou=users,dc=ubilink,dc=ai" \
  -D "cn=admin,dc=ubilink,dc=ai" \
  -w admin123 \
  "(objectClass=inetOrgPerson)" | grep "dn: uid=" | wc -l
```

### 3. 確認 Keycloak 運行正常
```bash
kubectl get pods -n keycloak
```

## 手動測試步驟

### 步驟 1: 訪問 Keycloak Admin Console

1. 打開瀏覽器，訪問：
   ```
   http://10.2.2.107:32387/admin
   ```

2. 使用以下憑證登入：
   - **Username**: `admin`
   - **Password**: `change-me-please`

### 步驟 2: 導航到 User Federation

1. 在左側菜單中，點擊 **User Federation**
2. 您應該看到一個名為 **openldap** 的 LDAP Provider

### 步驟 3: 測試 LDAP 連接

1. 點擊 **openldap** 進入配置頁面
2. 在配置頁面中，找到 **Test connection** 按鈕
3. 點擊 **Test connection** 按鈕
4. 應該會顯示連接成功的消息

### 步驟 4: 同步用戶

1. 在 **openldap** 配置頁面中，找到 **Synchronize all users** 按鈕
2. 點擊 **Synchronize all users**
3. 等待同步完成（可能需要幾分鐘，取決於用戶數量）
4. 同步完成後，您應該能在 **Users** 菜單中看到從 LDAP 同步的用戶

### 步驟 5: 驗證同步結果

1. 在左側菜單中，點擊 **Users**
2. 您應該能看到從 OpenLDAP 同步的用戶（例如：`hoover2274@gmail.com`）
3. 點擊一個用戶，檢查其詳細信息，確認是從 LDAP 同步的

## 預期結果

- ✅ LDAP 連接測試成功
- ✅ 用戶同步成功（約 176 個用戶）
- ✅ 用戶可以在 Keycloak 中看到

## 故障排除

### 如果連接測試失敗

1. **檢查 OpenLDAP 是否可訪問**
   ```bash
   # 從 Keycloak Pod 測試連接
   kubectl exec -n keycloak <keycloak-pod-name> -- nc -zv 10.2.1.108 389
   ```

2. **檢查 LDAP 配置**
   - 確認 `connectionUrl` 是 `ldap://10.2.1.108:389`
   - 確認 `bindDn` 是 `cn=admin,dc=ubilink,dc=ai`
   - 確認 `bindCredential` 是 `admin123`
   - 確認 `usersDn` 是 `ou=users,dc=ubilink,dc=ai`

3. **檢查 OpenLDAP 日誌**
   ```bash
   docker logs openldap --tail=50
   ```

### 如果用戶同步失敗

1. **檢查 OpenLDAP 中是否有用戶**
   ```bash
   docker exec openldap ldapsearch -x -H ldap://localhost:1389 \
     -b "ou=users,dc=ubilink,dc=ai" \
     -D "cn=admin,dc=ubilink,dc=ai" \
     -w admin123 \
     "(objectClass=inetOrgPerson)" | grep "dn: uid=" | head -5
   ```

2. **檢查 Keycloak 日誌**
   ```bash
   kubectl logs -n keycloak <keycloak-pod-name> --tail=100 | grep -i ldap
   ```

## 當前配置信息

- **OpenLDAP 地址**: `10.2.1.108:389`
- **Base DN**: `dc=ubilink,dc=ai`
- **Users DN**: `ou=users,dc=ubilink,dc=ai`
- **Bind DN**: `cn=admin,dc=ubilink,dc=ai`
- **Bind Password**: `admin123`
- **Keycloak Admin Console**: `http://10.2.2.107:32387/admin`
- **Keycloak Admin 帳號**: `admin`
- **Keycloak Admin 密碼**: `change-me-please`

