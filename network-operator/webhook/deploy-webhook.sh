#!/bin/bash
# RDMA Auto Injector Webhook 部署腳本

set -e

NAMESPACE="nvidia-network-operator"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "============================================================"
echo "部署 RDMA Auto Injector Webhook"
echo "============================================================"

# 1. 檢查命名空間
echo -e "\n[1/6] 檢查命名空間..."
if ! kubectl get namespace "$NAMESPACE" &>/dev/null; then
    echo "錯誤: namespace '$NAMESPACE' 不存在"
    exit 1
fi
echo "✓ Namespace 存在"

# 2. 檢查 ConfigMap nccl-rdma-env
echo -e "\n[2/6] 檢查 NCCL ConfigMap..."
if ! kubectl get configmap nccl-rdma-env -n default &>/dev/null; then
    echo "⚠ ConfigMap 'nccl-rdma-env' 不存在，正在創建..."
    kubectl create configmap nccl-rdma-env -n default \
      --from-literal=NCCL_IB_DISABLE=0 \
      --from-literal=NCCL_IB_HCA=mlx5 \
      --from-literal=NCCL_DEBUG=INFO
    echo "✓ ConfigMap 已創建"
else
    echo "✓ ConfigMap 已存在"
fi

# 3. 生成 TLS 證書
echo -e "\n[3/6] 生成 TLS 證書..."
if [ -f "$SCRIPT_DIR/generate-certs.sh" ]; then
    bash "$SCRIPT_DIR/generate-certs.sh"
else
    echo "⚠ 證書生成腳本不存在，請手動生成證書"
    echo "   運行: $SCRIPT_DIR/generate-certs.sh"
fi

# 4. 創建 webhook.py ConfigMap
echo -e "\n[4/6] 創建 webhook.py ConfigMap..."
if [ -f "$SCRIPT_DIR/webhook.py" ]; then
    kubectl create configmap rdma-injector-script \
      --from-file=webhook.py="$SCRIPT_DIR/webhook.py" \
      -n "$NAMESPACE" \
      --dry-run=client -o yaml | kubectl apply -f -
    echo "✓ webhook.py ConfigMap 已創建/更新"
else
    echo "✗ 錯誤: webhook.py 不存在"
    exit 1
fi

# 5. 安裝 Python 依賴（如果需要）
echo -e "\n[5/6] 檢查部署配置..."
if [ -f "$SCRIPT_DIR/rdma-auto-injector.yaml" ]; then
    echo "✓ 部署 YAML 文件存在"
else
    echo "✗ 錯誤: rdma-auto-injector.yaml 不存在"
    exit 1
fi

# 6. 部署 Webhook
echo -e "\n[6/7] 部署 Webhook..."
kubectl apply -f "$SCRIPT_DIR/rdma-auto-injector.yaml"

# 7. 更新 CA Bundle（如果證書已生成）
echo -e "\n[7/7] 更新 CA Bundle..."
if kubectl get secret rdma-injector-certs -n "$NAMESPACE" &>/dev/null; then
    # 從 Secret 中提取 CA（如果存在）
    CA_BUNDLE=$(kubectl get secret rdma-injector-certs -n "$NAMESPACE" -o jsonpath='{.data.ca\.crt}' 2>/dev/null)
    if [ -z "$CA_BUNDLE" ]; then
        # 如果 Secret 中沒有 CA，嘗試從臨時目錄讀取
        TMP_DIR=$(find /tmp -name "webhook-certs" -type d 2>/dev/null | head -1)
        if [ -n "$TMP_DIR" ] && [ -f "$TMP_DIR/ca.crt" ]; then
            CA_BUNDLE=$(cat "$TMP_DIR/ca.crt" | base64 -w 0 2>/dev/null || cat "$TMP_DIR/ca.crt" | base64 | tr -d '\n')
        fi
    fi
    
    if [ -n "$CA_BUNDLE" ]; then
        kubectl patch mutatingwebhookconfiguration rdma-auto-injector \
          --type='json' \
          -p="[{\"op\": \"replace\", \"path\": \"/webhooks/0/clientConfig/caBundle\", \"value\": \"${CA_BUNDLE}\"}]" \
          2>/dev/null && echo "✓ CA Bundle 已更新" || echo "⚠ 無法更新 CA Bundle，請手動更新"
    else
        echo "⚠ 未找到 CA 證書，請手動更新 MutatingWebhookConfiguration"
    fi
else
    echo "⚠ Secret 不存在，請先運行 generate-certs.sh"
fi

echo -e "\n等待 Webhook Pod 就緒..."
kubectl wait --for=condition=ready pod \
  -l app=rdma-auto-injector \
  -n "$NAMESPACE" \
  --timeout=120s || true

echo -e "\n============================================================"
echo "部署完成！"
echo "============================================================"
echo -e "\n驗證部署:"
echo "  kubectl get pods -n $NAMESPACE -l app=rdma-auto-injector"
echo "  kubectl get mutatingwebhookconfiguration rdma-auto-injector"
echo -e "\n測試:"
echo "  創建一個請求 GPU 的 Pod，應該會自動注入 RDMA 資源"
echo "============================================================"

