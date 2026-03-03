#!/bin/bash
set -e

CHART_DIR="./helm"
RELEASE_NAME="resource-quota-manager"
NAMESPACE="resource-quota-manager"
IMAGE_NAME="resource-quota-manager"
IMAGE_TAG="latest"

echo "=========================================="
echo "🚀 ResourceQuota Manager Helm 部署"
echo "=========================================="
echo ""

# 检查 Helm
if ! command -v helm &> /dev/null; then
    echo "❌ Helm 未安装"
    echo "   安装: curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash"
    exit 1
fi

# 0. 清理旧的资源
echo "🧹 清理旧的资源..."
helm uninstall ${RELEASE_NAME} --namespace ${NAMESPACE} 2>/dev/null || true
kubectl delete clusterrole ${RELEASE_NAME} 2>/dev/null || true
kubectl delete clusterrolebinding ${RELEASE_NAME} 2>/dev/null || true
kubectl delete namespace ${NAMESPACE} --grace-period=0 --force 2>/dev/null || true

# 等待 namespace 完全删除
echo "⏳ 等待 namespace 完全删除..."
for i in {1..60}; do
    if ! kubectl get namespace ${NAMESPACE} &>/dev/null; then
        echo "✅ Namespace 已删除"
        break
    fi
    if [ $i -eq 60 ]; then
        echo "❌ Namespace 删除超时"
        kubectl patch namespace ${NAMESPACE} -p '{"metadata":{"finalizers":[]}}' --type=merge 2>/dev/null || true
        sleep 5
    else
        sleep 1
    fi
done

# 1. 构建镜像
echo "1️⃣  构建 Docker 镜像..."
docker build -t ${IMAGE_NAME}:${IMAGE_TAG} . >/dev/null 2>&1
echo "✅ 镜像构建完成"

# 2. 导入到 containerd
echo "2️⃣  导入镜像到 containerd..."
docker save ${IMAGE_NAME}:${IMAGE_TAG} -o /tmp/${IMAGE_NAME}.tar

if command -v ctr &> /dev/null; then
    ctr -n k8s.io images import /tmp/${IMAGE_NAME}.tar 2>/dev/null || \
    crictl load -i /tmp/${IMAGE_NAME}.tar 2>/dev/null
elif command -v crictl &> /dev/null; then
    crictl load -i /tmp/${IMAGE_NAME}.tar
fi

rm -f /tmp/${IMAGE_NAME}.tar
echo "✅ 镜像导入完成"
echo ""

# 3. 先创建 namespace
echo "3️⃣  创建 Namespace..."
kubectl create namespace ${NAMESPACE}
echo "✅ Namespace 创建完成"
echo ""

# 4. Helm 部署（不创建 namespace）
echo "4️⃣  Helm 部署..."
helm upgrade --install ${RELEASE_NAME} ${CHART_DIR} \
  --namespace ${NAMESPACE} \
  --set image.pullPolicy=Never \
  --set service.type=NodePort \
  --set namespace.create=false \
  --wait \
  --timeout 5m

# 5. 显示状态
echo ""
echo "=========================================="
echo "✅ 部署完成！"
echo "=========================================="
kubectl get all -n ${NAMESPACE}

NODE_PORT=$(kubectl get svc -n ${NAMESPACE} ${RELEASE_NAME} -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null || echo "N/A")
NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null || echo "N/A")

if [ "$NODE_PORT" != "N/A" ] && [ "$NODE_IP" != "N/A" ]; then
    echo ""
    echo "🌐 访问地址: http://${NODE_IP}:${NODE_PORT}"
    echo ""
    echo "📋 测试 API:"
    echo "   curl http://${NODE_IP}:${NODE_PORT}/api/namespaces"
fi

echo ""
echo "🔍 查看日志:"
echo "   kubectl logs -n ${NAMESPACE} -l app.kubernetes.io/name=resource-quota-manager -f"
echo ""
echo "🗑️  卸载命令:"
echo "   helm uninstall ${RELEASE_NAME} -n ${NAMESPACE}"
echo "   kubectl delete namespace ${NAMESPACE}"
