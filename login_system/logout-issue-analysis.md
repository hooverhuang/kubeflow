# 登出問題分析報告

## 當前配置
**LOGOUT_URL**: `/oauth2/sign_out?rd=https%3A%2F%2Fauthentik.ubilink.ai%2Fapplication%2Fo%2Fkubeflow-dex%2Fend-session%2F%3Fredirect_uris%3Dhttps%3A%2F%2Fkubeflow.ubilink.ai%2F`

解碼後：
- 登出端點: `/oauth2/sign_out`
- rd 參數: `https://authentik.ubilink.ai/application/o/kubeflow-dex/end-session/?redirect_uris=https://kubeflow.ubilink.ai/`

## 問題分析

### 1. Dex 登出端點行為
- `/oauth2/sign_out` 無論是否帶參數，都重定向到 `/`
- Dex 沒有處理 `rd` 參數，無法自定義重定向目標

### 2. Authentik end-session 端點
- Authentik 的 end-session 端點存在且正常工作
- 會重定向到 Authentik 登錄頁面

### 3. 預期行為
登出後應該：
1. 清除 Dex session cookie
2. 重定向到 `/dex/auth/authentik` 來重新登錄

## 解決方案

### 方案 1：修改 LOGOUT_URL（推薦）
將 LOGOUT_URL 改為直接重定向到登錄頁面：
```
LOGOUT_URL=/oauth2/sign_out?rd=/dex/auth/authentik
```

### 方案 2：使用 Authentik end-session（如果 Dex 支持）
保持當前配置，但需要確保 Dex 能處理 `rd` 參數

### 方案 3：前端處理
在前端登出按鈕中，登出後手動重定向到 `/dex/auth/authentik`
