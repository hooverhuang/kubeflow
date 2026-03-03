# Dex 登出問題解決方案

## 問題描述
1. 登出按鈕不見了
2. 登出後需要清除 cookie 才能再登入

## 原因分析
Dex 本身不提供標準的 `/oauth2/sign_out` 端點，登出需要手動清除 session cookie。

## 解決方案

### 方案 1：在 Kubeflow 前端實現登出功能
登出時需要清除以下內容：
1. **Dex Session Cookie**: `dex_session`
2. **應用端 Token**: localStorage/sessionStorage 中的 token
3. **其他認證相關 Cookie**

### 方案 2：配置 Dex 的登出重定向
可以在 Dex 配置中添加登出相關設置（如果支持）。

## 臨時解決方案
用戶可以手動清除瀏覽器 cookie，或訪問：
- 清除所有 `kubeflow.ubilink.ai` 的 cookie
- 重新訪問登錄頁面

## 檢查命令
```bash
# 檢查 Dex 的端點
curl https://kubeflow.ubilink.ai/dex/.well-known/openid-configuration

# 檢查 Dex 配置
kubectl get configmap dex -n auth -o yaml
```
