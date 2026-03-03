# KServe 流量控制器配置

本仓库包含 KServe InferenceService 流量控制相关的 Kubernetes 配置。

## 📁 目录结构

```
kserve-configs/
├── configmaps/                    # KServe 和 Knative 配置
│   ├── inferenceservice-config.yaml    # KServe 主配置（ingressDomain, pathTemplate）
│   └── config-domain.yaml             # Knative Serving 域名配置
├── authorizationpolicies/         # Istio 授权策略
│   ├── allow-all-api-ubilink-inferenceservices.yaml    # 允许 api.ubilink.ai 访问
│   ├── istio-ingressgateway-require-jwt-patch.yaml     # JWT 策略补丁
│   └── istio-ingressgateway-oauth2-proxy-patch.yaml    # OAuth2 策略补丁
├── controller/                    # 自动控制器
│   └── isvc-authz-controller-script.yaml               # InferenceService 授权策略自动创建脚本
└── README.md
```

## 🔧 配置说明

### 1. ConfigMaps

#### `inferenceservice-config` (kubeflow namespace)
- **ingressDomain**: `api.ubilink.ai` - KServe 服务的基础域名
- **domainTemplate**: `{{ .Name }}-{{ .Namespace }}.{{ .IngressDomain }}` - 域名生成模板
- **pathTemplate**: `/serving/{{ .Namespace }}/{{ .Name }}` - URL 路径模板
- **ingressGateway**: `kubeflow/kubeflow-gateway` - Istio Gateway 配置

#### `config-domain` (knative-serving namespace)
- 配置 Knative Serving 使用 `api.ubilink.ai` 作为服务域名

### 2. AuthorizationPolicies

#### `allow-all-api-ubilink-inferenceservices`
- 允许所有对 `api.ubilink.ai` 及其子域的访问
- 应用于 `istio-ingressgateway`
- 支持 GET, POST, OPTIONS, PUT, DELETE, HEAD 方法

#### `istio-ingressgateway-require-jwt-patch`
- 修改 JWT 验证策略，将 `api.ubilink.ai` 和 `/serving/*` 路径排除在外
- 允许 InferenceService 无需 JWT 认证即可访问

#### `istio-ingressgateway-oauth2-proxy-patch`
- 修改 OAuth2 代理策略，将 `api.ubilink.ai` 和 `/serving/*` 路径排除在外
- 允许 InferenceService 无需 OAuth2 认证即可访问

### 3. Controller Script

#### `isvc-authz-controller-script`
- 自动为每个包含 InferenceService 的 namespace 创建 AuthorizationPolicy
- 策略名称格式：`allow-all-inferenceservice-<namespace>`
- 允许所有对 predictor 组件的访问
- 每 10 秒检查一次，自动创建缺失的策略

## 🚀 部署步骤

### 1. 部署 ConfigMaps

```bash
# KServe 配置
kubectl apply -f configmaps/inferenceservice-config.yaml

# Knative 域名配置
kubectl apply -f configmaps/config-domain.yaml
```

### 2. 部署 AuthorizationPolicies

```bash
# 允许 api.ubilink.ai 访问
kubectl apply -f authorizationpolicies/allow-all-api-ubilink-inferenceservices.yaml

# 更新 JWT 策略
kubectl apply -f authorizationpolicies/istio-ingressgateway-require-jwt-patch.yaml

# 更新 OAuth2 策略
kubectl apply -f authorizationpolicies/istio-ingressgateway-oauth2-proxy-patch.yaml
```

### 3. 部署 Controller

```bash
# 步骤 1: 创建 ConfigMap（Controller 脚本）
kubectl apply -f controller/isvc-authz-controller-script.yaml

# 步骤 2: 创建 RBAC（ServiceAccount + ClusterRole + ClusterRoleBinding）
kubectl apply -f controller/isvc-authz-controller-rbac.yaml

# 步骤 3: 创建 Deployment（启动 Controller）
kubectl apply -f controller/isvc-authz-controller-deployment.yaml

# 验证部署
kubectl get pods -n kubeflow | grep isvc-authz-controller
kubectl logs -n kubeflow -l app=isvc-authz-controller
```

## 📝 访问格式

部署后，InferenceService 可通过以下格式访问：

```
https://api.ubilink.ai/serving/<namespace>/<name>/v1/models
```

例如：
```
https://api.ubilink.ai/serving/hooverhuang/test-model-hooverhuang/v1/models
```

## ⚠️ 注意事项

1. **DNS 配置**：确保 `api.ubilink.ai` 的 DNS 记录指向正确的 IP 地址
2. **HAProxy/负载均衡器**：需要配置将 `api.ubilink.ai` 的流量转发到 Kubernetes Ingress Gateway
3. **SSL 证书**：确保 HTTPS 证书已正确配置
4. **Controller 部署**：按照步骤 3 部署 Controller，它会自动为每个有 InferenceService 的 namespace 创建 AuthorizationPolicy

## 🔄 更新历史

- **2025-12-05**: 初始配置，支持 `api.ubilink.ai` 域名访问
- 配置了 KServe ingressDomain 和 pathTemplate
- 添加了 Istio AuthorizationPolicies 以绕过认证
- 创建了自动 AuthorizationPolicy 控制器

