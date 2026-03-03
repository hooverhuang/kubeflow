# ResourceQuota Manager

Kubernetes ResourceQuota 管理系统的前后端应用。

## 功能特性

- 📊 查看和管理 Kubernetes ResourceQuotas
- 🎯 实时查看资源使用情况
- 🖥️ 现代化的 Web UI
- 🔧 支持 Helm Chart 部署

## 项目结构

## 快速开始

### 本地开发

```bash
# 1. 安装依赖
cd backend
pip install -r requirements.txt

# 2. 运行后端
python app.py
```

### Docker 部署

```bash
# 1. 构建镜像
docker build -t resource-quota-manager:latest .

# 2. 运行容器
docker run -d \
  --name resource-quota-manager \
  -p 8080:5000 \
  -v ~/.kube/config:/root/.kube/config:ro \
  resource-quota-manager:latest
```

### Kubernetes 部署（Helm）

```bash
# 使用自动化脚本
./scripts/deploy-helm.sh

# 或手动部署
helm upgrade --install resource-quota-manager ./helm \
  --namespace resource-quota-manager \
  --create-namespace \
  --set image.pullPolicy=Never \
  --set service.type=NodePort
```

## API 端点

- `GET /api/namespaces` - 获取所有命名空间
- `GET /api/quota/<namespace>` - 获取指定命名空间的 ResourceQuota
- `POST /api/quota/<namespace>` - 创建 ResourceQuota
- `PUT /api/quota/<namespace>/<quota_name>` - 更新 ResourceQuota
- `DELETE /api/quota/<namespace>/<quota_name>` - 删除 ResourceQuota
- `GET /api/pods/<namespace>` - 获取命名空间中的 Pod 资源使用情况

## 访问地址

部署完成后，通过以下地址访问：
# 1. 构建镜像
docker build -t resource-quota-manager:latest .

# 2. 运行容器
docker run -d \
  --name resource-quota-manager \
  -p 8080:5000 \
  -v ~/.kube/config:/root/.kube/config:ro \
  resource-quota-manager:latest
# 使用自动化脚本
./scripts/deploy-helm.sh

# 或手动部署
helm upgrade --install resource-quota-manager ./helm \
  --namespace resource-quota-manager \
  --create-namespace \
  --set image.pullPolicy=Never \
  --set service.type=NodePort


API 端点
GET /api/namespaces - 获取所有命名空间
GET /api/quota/<namespace> - 获取指定命名空间的 ResourceQuota
POST /api/quota/<namespace> - 创建 ResourceQuota
PUT /api/quota/<namespace>/<quota_name> - 更新 ResourceQuota
DELETE /api/quota/<namespace>/<quota_name> - 删除 ResourceQuota
GET /api/pods/<namespace> - 获取命名空间中的 Pod 资源使用情况

访问地址
部署完成后，通过以下地址访问：
http://<NODE_IP>:<NODE_PORT>