# 登入後自動返回前端配置指南

## 問題描述

目前登入流程：前端 → Kubeflow → Dex → Auth Proxy → 登入成功 → **停留在 Kubeflow Dashboard**

期望流程：前端 → Kubeflow → Dex → Auth Proxy → 登入成功 → **自動返回前端 `http://10.2.2.108:5173/`**

## 解決方案

### 方案 1：使用 Kubeflow 的 `rd` 參數（最簡單，但可能不會自動重定向）

**原理**：Kubeflow 支援 `rd` (redirect) 參數，可在登入後重定向到指定 URL。

**修改位置**：`/root/kubeflow-ui/client/src/pages/Login.tsx`

**修改方式**：
```typescript
const handleLoginClick = () => {
  const frontendUrl = 'http://10.2.2.108:5173/';
  // 使用 rd 參數告訴 Kubeflow 登入後要重定向到哪裡
  window.location.href = `https://kubeflow.ubilink.ai?rd=${encodeURIComponent(frontendUrl)}`;
};
```

**注意**：根據之前的測試，Kubeflow 的 `rd` 參數可能不會自動重定向，可能需要用戶手動點擊。

---

### 方案 2：修改 Auth Proxy 支援 `frontend_redirect_uri` 參數（推薦）

**原理**：在 Auth Proxy 的 `/authorize` 端點接收額外的 `frontend_redirect_uri` 參數，登入成功後先完成 OIDC 流程，然後在重定向 URL 中加入 `rd` 參數。

**修改位置**：`/root/login_system/auth-proxy/app.py`

#### 步驟 1：修改 `/authorize` 端點

在 `@app.route('/authorize', methods=['GET'])` 函數中：

```python
@app.route('/authorize', methods=['GET'])
def authorize():
    """OIDC 授權端點"""
    client_id = request.args.get('client_id')
    redirect_uri = request.args.get('redirect_uri')  # Dex callback URL
    frontend_redirect_uri = request.args.get('frontend_redirect_uri')  # 新增：前端 URL
    scope = request.args.get('scope', 'openid profile email')
    state = request.args.get('state')
    prompt = request.args.get('prompt', '')
    
    # ... 現有代碼 ...
    
    # 在登入表單中加入 frontend_redirect_uri 隱藏欄位
    # 修改登入表單的 HTML，加入：
    # <input type="hidden" name="frontend_redirect_uri" value="{frontend_redirect_uri}">
    
    # 在已登錄的情況下，生成授權碼時保存 frontend_redirect_uri
    auth_codes_storage[auth_code] = {
        'client_id': client_id,
        'redirect_uri': redirect_uri,
        'frontend_redirect_uri': frontend_redirect_uri,  # 新增
        'scope': scope,
        'user_email': user_email_for_oidc,
        'username': session.get('username', ''),
        'expires_at': datetime.now() + timedelta(minutes=10)
    }
    
    # 如果有 frontend_redirect_uri，在重定向到 Dex callback 時加入 rd 參數
    if frontend_redirect_uri:
        redirect_url = f"{redirect_uri}?code={auth_code}&state={state}&rd={encodeURIComponent(frontend_redirect_uri)}"
    else:
        redirect_url = f"{redirect_uri}?code={auth_code}&state={state}"
    
    return redirect(redirect_url)
```

#### 步驟 2：修改 `/login` 端點

在 `@app.route('/login', methods=['POST'])` 函數中：

```python
@app.route('/login', methods=['POST'])
def login():
    """處理登錄請求"""
    username = request.form.get('username')
    password = request.form.get('password')
    client_id = request.form.get('client_id')
    redirect_uri = request.form.get('redirect_uri')
    frontend_redirect_uri = request.form.get('frontend_redirect_uri')  # 新增
    scope = request.form.get('scope')
    state = request.form.get('state')
    
    # ... 現有驗證代碼 ...
    
    # 生成授權碼時保存 frontend_redirect_uri
    auth_codes_storage[auth_code] = {
        'client_id': client_id,
        'redirect_uri': redirect_uri,
        'frontend_redirect_uri': frontend_redirect_uri,  # 新增
        'scope': scope,
        'user_email': user_email_for_oidc,
        'username': user['username'],
        'expires_at': datetime.now() + timedelta(minutes=10)
    }
    
    # 如果有 frontend_redirect_uri，在重定向到 Dex callback 時加入 rd 參數
    if frontend_redirect_uri:
        redirect_url = f"{redirect_uri}?code={auth_code}&state={state}&rd={encodeURIComponent(frontend_redirect_uri)}"
    else:
        redirect_url = f"{redirect_uri}?code={auth_code}&state={state}"
    
    return redirect(redirect_url)
```

#### 步驟 3：修改前端登入流程

**修改位置**：`/root/kubeflow-ui/client/src/pages/Login.tsx`

**修改方式**：
```typescript
const handleLoginClick = () => {
  const frontendUrl = 'http://10.2.2.108:5173/';
  // 直接調用 Auth Proxy 的 authorize 端點，並傳入 frontend_redirect_uri
  const authProxyUrl = 'https://kubeflowlogin.ubilink.ai/authorize';
  const params = new URLSearchParams({
    client_id: 'kubeflow-auth-proxy',
    redirect_uri: 'https://kubeflow.ubilink.ai/dex/callback',
    frontend_redirect_uri: frontendUrl,  // 新增：告訴 Auth Proxy 最終要重定向到前端
    scope: 'openid profile email',
    state: Math.random().toString(36).substring(7),
  });
  window.location.href = `${authProxyUrl}?${params.toString()}`;
};
```

**注意**：這個方案需要確保 Kubeflow 的 OAuth2 Proxy 支援 `rd` 參數的自動重定向。

---

### 方案 3：修改前端直接使用 Auth Proxy 的 OIDC 端點（最複雜，但最靈活）

**原理**：前端直接調用 Auth Proxy 的 OIDC 端點，`redirect_uri` 設為前端 URL，前端處理 OIDC callback。

**修改位置**：
1. `/root/kubeflow-ui/client/src/pages/Login.tsx` - 修改登入流程
2. `/root/kubeflow-ui/client/src/pages/AuthCallback.tsx` - 新增 OIDC callback 處理頁面
3. `/root/kubeflow-ui/client/src/App.tsx` - 新增 `/auth/callback` 路由

#### 步驟 1：修改前端登入流程

```typescript
const handleLoginClick = () => {
  const frontendUrl = 'http://10.2.2.108:5173/auth/callback';
  const authProxyUrl = 'https://kubeflowlogin.ubilink.ai/authorize';
  const params = new URLSearchParams({
    client_id: 'kubeflow-auth-proxy',
    redirect_uri: frontendUrl,  // 直接重定向到前端 callback
    scope: 'openid profile email',
    state: Math.random().toString(36).substring(7),
    response_type: 'code',
  });
  window.location.href = `${authProxyUrl}?${params.toString()}`;
};
```

#### 步驟 2：新增 Auth Callback 頁面

創建 `/root/kubeflow-ui/client/src/pages/AuthCallback.tsx`：

```typescript
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  useEffect(() => {
    if (code) {
      // 使用授權碼向 Auth Proxy 的 /token 端點獲取 token
      // 注意：這需要後端代理，因為 token 端點需要 client_secret
      fetch('/api/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: 'http://10.2.2.108:5173/auth/callback',
          client_id: 'kubeflow-auth-proxy',
        }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.access_token) {
            // 保存 token
            localStorage.setItem('kubeflow_token', data.access_token);
            localStorage.setItem('kubeflow_logged_in', 'true');
            navigate('/dashboard');
          }
        })
        .catch(err => {
          console.error('Token exchange failed:', err);
          navigate('/login');
        });
    } else {
      navigate('/login');
    }
  }, [code, navigate]);

  return <div>處理登入中...</div>;
}
```

#### 步驟 3：新增後端 Token 交換端點

**修改位置**：`/root/kubeflow-ui/server/index.js`

```javascript
// 新增端點：代理 Auth Proxy 的 /token 端點
app.post('/api/auth/token', async (req, res) => {
  try {
    const { code, redirect_uri, client_id } = req.body;
    
    // 向 Auth Proxy 的 /token 端點發送請求
    const response = await fetch('https://kubeflowlogin.ubilink.ai/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirect_uri,
        client_id: client_id,
        client_secret: process.env.AUTH_PROXY_CLIENT_SECRET || 'change-this-secret-key-in-production',
      }),
    });
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Token exchange error:', error);
    res.status(500).json({ error: 'Token exchange failed' });
  }
});
```

**注意**：這個方案需要：
1. 在後端環境變數中設定 `AUTH_PROXY_CLIENT_SECRET`
2. 前端需要處理 OIDC callback
3. 需要確保 Auth Proxy 允許前端 URL 作為 `redirect_uri`

---

## 推薦方案

**建議使用方案 2**，因為：
1. 不需要大幅修改現有架構
2. 仍然使用 Kubeflow 的認證流程
3. 只需要在 Auth Proxy 和前端做小幅度修改

**如果方案 2 不生效**（Kubeflow 不支援 `rd` 參數自動重定向），可以考慮：
- 方案 1：簡單但需要用戶手動操作
- 方案 3：最靈活但需要更多開發工作

## 測試步驟

1. 修改代碼後，重新啟動服務
2. 訪問前端登入頁面
3. 點擊「登入 Kubeflow」
4. 完成登入流程
5. 檢查是否自動返回前端

## 注意事項

1. **安全性**：確保 `frontend_redirect_uri` 參數經過驗證，防止開放重定向攻擊
2. **URL 編碼**：使用 `encodeURIComponent` 正確編碼 URL 參數
3. **環境變數**：如果使用方案 3，需要在後端設定 `AUTH_PROXY_CLIENT_SECRET`
4. **CORS**：如果前端直接調用 Auth Proxy，可能需要配置 CORS
