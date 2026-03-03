#!/bin/bash
# 生成 Webhook TLS 證書

set -e

SERVICE_NAME=rdma-auto-injector
NAMESPACE=nvidia-network-operator

echo "============================================================"
echo "生成 RDMA Auto Injector Webhook TLS 證書"
echo "============================================================"

# 創建臨時目錄
TMP_DIR=$(mktemp -d)
cd "$TMP_DIR"

echo "1. 生成私鑰..."
openssl genrsa -out tls.key 2048

echo "2. 生成證書簽名請求..."
openssl req -new -key tls.key -out tls.csr \
  -subj "/CN=${SERVICE_NAME}.${NAMESPACE}.svc"

echo "3. 生成 CA 私鑰和證書..."
openssl genrsa -out ca.key 2048
openssl req -new -x509 -days 365 -key ca.key -out ca.crt \
  -subj "/CN=RDMA-Injector-CA"

echo "4. 生成自簽名證書（使用 CA 簽名）..."
openssl x509 -req -days 365 -in tls.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out tls.crt \
  -extensions v3_req -extfile <(
    echo "[v3_req]"
    echo "keyUsage = keyEncipherment, dataEncipherment"
    echo "extendedKeyUsage = serverAuth"
    echo "subjectAltName = @alt_names"
    echo "[alt_names]"
    echo "DNS.1 = ${SERVICE_NAME}"
    echo "DNS.2 = ${SERVICE_NAME}.${NAMESPACE}"
    echo "DNS.3 = ${SERVICE_NAME}.${NAMESPACE}.svc"
    echo "DNS.4 = ${SERVICE_NAME}.${NAMESPACE}.svc.cluster.local"
  )

echo "5. 創建 Kubernetes Secret..."
# 檢查 Secret 是否已存在
if kubectl get secret rdma-injector-certs -n "$NAMESPACE" &>/dev/null; then
    echo "   Secret 已存在，是否要更新？(y/n)"
    read -r CONFIRM
    if [ "$CONFIRM" = "y" ] || [ "$CONFIRM" = "Y" ]; then
        kubectl delete secret rdma-injector-certs -n "$NAMESPACE"
    else
        echo "   跳過創建 Secret"
        exit 0
    fi
fi

kubectl create secret tls rdma-injector-certs \
  --cert=tls.crt \
  --key=tls.key \
  -n "$NAMESPACE"

echo ""
echo "6. 更新 MutatingWebhookConfiguration 的 CA Bundle..."
CA_BUNDLE=$(cat ca.crt | base64 -w 0)
if [ -z "$CA_BUNDLE" ]; then
    CA_BUNDLE=$(cat ca.crt | base64 | tr -d '\n')
fi

# 更新 MutatingWebhookConfiguration
kubectl patch mutatingwebhookconfiguration rdma-auto-injector \
  --type='json' \
  -p="[{\"op\": \"replace\", \"path\": \"/webhooks/0/clientConfig/caBundle\", \"value\": \"${CA_BUNDLE}\"}]" \
  2>/dev/null || echo "⚠ MutatingWebhookConfiguration 尚未創建，將在部署時自動設置"

echo ""
echo "✓ 證書已生成並創建 Secret: rdma-injector-certs"
echo "✓ CA Bundle 已準備好（將在部署時使用）"
echo "  位置: $TMP_DIR"
echo "  CA Bundle (base64): ${CA_BUNDLE:0:50}..."
echo "============================================================"

# 清理臨時文件（可選）
# rm -rf "$TMP_DIR"

