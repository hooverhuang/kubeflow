# 推送到 GitLab 的步骤

## 📦 文件已准备完成

所有配置已保存在 `/tmp/kserve-configs/` 目录，并已提交到本地 git 仓库。

## 🚀 推送到 GitLab 的方法

### 方法 1: 使用 HTTPS（需要用户名密码或 Personal Access Token）

```bash
cd /tmp/kserve-configs

# 如果 GitLab 仓库已存在，直接推送
git push -u origin master

# 如果需要输入用户名密码，GitLab 会提示
# 或者使用 Personal Access Token 作为密码
```

### 方法 2: 使用 SSH（推荐）

```bash
cd /tmp/kserve-configs

# 1. 修改远程 URL 为 SSH
git remote set-url origin git@10.2.240.103:kubeflow1/modelapi.git

# 2. 确保 SSH 密钥已配置
# 3. 推送
git push -u origin master
```

### 方法 3: 在 GitLab Web UI 中创建项目后推送

1. 访问 http://10.2.240.103/kubeflow1/modelapi
2. 如果项目不存在，点击 "New project" 创建
3. 项目名称：`modelapi`
4. 选择 "Initialize repository with a README"（可选）
5. 创建后，复制推送命令并执行：

```bash
cd /tmp/kserve-configs
git remote set-url origin <GitLab 提供的 URL>
git push -u origin master
```

## 📋 文件清单

已准备的文件：
- ✅ `README.md` - 配置说明文档
- ✅ `configmaps/inferenceservice-config.yaml` - KServe 主配置
- ✅ `configmaps/config-domain.yaml` - Knative 域名配置
- ✅ `authorizationpolicies/allow-all-api-ubilink-inferenceservices.yaml` - 允许 api.ubilink.ai 访问
- ✅ `authorizationpolicies/istio-ingressgateway-require-jwt-patch.yaml` - JWT 策略补丁
- ✅ `authorizationpolicies/istio-ingressgateway-oauth2-proxy-patch.yaml` - OAuth2 策略补丁
- ✅ `controller/isvc-authz-controller-script.yaml` - 自动控制器脚本

## 🔐 认证配置

如果需要配置 GitLab 认证：

### 使用 Personal Access Token（推荐）

1. 在 GitLab 中创建 Personal Access Token（Settings → Access Tokens）
2. 推送时使用 token 作为密码：

```bash
git push -u origin master
# Username: <your-username>
# Password: <your-personal-access-token>
```

### 配置 Git Credential Helper

```bash
git config --global credential.helper store
# 第一次推送后，凭证会被保存
```

## 📍 当前状态

- ✅ 本地 git 仓库已初始化
- ✅ 所有文件已添加并提交
- ✅ 远程仓库 URL: http://10.2.240.103/kubeflow1/modelapi.git
- ⏳ 等待推送到 GitLab

## 🎯 快速推送命令

如果 GitLab 仓库已存在且已配置认证：

```bash
cd /tmp/kserve-configs && git push -u origin master
```

