# 修復登出重定向問題

## 問題描述
登出後應該重定向到 Authentik 登錄頁面 (`/dex/auth/authentik`)，但現在重定向到首頁 (`/`)

## 當前行為
- `/oauth2/sign_out` 返回 302，重定向到 `/`
- 應該重定向到 `/dex/auth/authentik`

## 解決方案

### 方案 1：修改 centraldashboard 配置
在 centraldashboard 的環境變量中添加登出後的重定向 URL

### 方案 2：使用 URL 參數
訪問登出時帶上重定向參數：
`/oauth2/sign_out?redirect_uri=/dex/auth/authentik`

### 方案 3：修改前端代碼
在登出按鈕的實現中，登出後手動重定向到登錄頁面

## 檢查命令
```bash
# 檢查登出端點
curl -I https://kubeflow.ubilink.ai/oauth2/sign_out

# 檢查登錄端點
curl -I https://kubeflow.ubilink.ai/dex/auth/authentik
```
