#!/bin/bash
# 測試 Webhook 是否正常工作

echo "============================================================"
echo "測試 RDMA Auto Injector Webhook"
echo "============================================================"

# 創建測試 Pod（請求 GPU，但不請求 RDMA）
echo -e "\n1. 創建測試 Pod（只請求 GPU）..."
kubectl run test-webhook-pod --image=pytorch/pytorch:2.1.0-cuda11.8-cudnn8-runtime \
  --restart=Never \
  --overrides='
{
  "spec": {
    "containers": [{
      "name": "test",
      "command": ["sleep", "infinity"],
      "resources": {
        "requests": {"nvidia.com/gpu": "1"},
        "limits": {"nvidia.com/gpu": "1"}
      }
    }]
  }
}' \
  --dry-run=client -o yaml > /tmp/test-pod.yaml

echo "✓ 測試 Pod YAML 已創建: /tmp/test-pod.yaml"

# 應用 Pod（Webhook 會自動修改）
echo -e "\n2. 應用 Pod（Webhook 會自動注入 RDMA）..."
kubectl apply -f /tmp/test-pod.yaml

sleep 2

# 檢查 Pod 資源
echo -e "\n3. 檢查 Pod 資源配置..."
RESOURCES=$(kubectl get pod test-webhook-pod -o jsonpath='{.spec.containers[0].resources}' 2>/dev/null)

if echo "$RESOURCES" | grep -q "rdma/rdma_shared_device_a"; then
    echo "✓ 成功！RDMA 資源已自動注入"
    echo ""
    echo "$RESOURCES" | jq .
else
    echo "✗ 失敗！RDMA 資源未注入"
    echo "資源配置:"
    echo "$RESOURCES" | jq .
fi

# 檢查環境變數
echo -e "\n4. 檢查環境變數..."
ENV_FROM=$(kubectl get pod test-webhook-pod -o jsonpath='{.spec.containers[0].envFrom}' 2>/dev/null)
if echo "$ENV_FROM" | grep -q "nccl-rdma-env"; then
    echo "✓ 成功！NCCL ConfigMap 已自動注入"
else
    echo "⚠ NCCL ConfigMap 未注入"
fi

# 清理
echo -e "\n5. 清理測試 Pod..."
kubectl delete pod test-webhook-pod --ignore-not-found=true

echo -e "\n============================================================"
echo "測試完成"
echo "============================================================"

