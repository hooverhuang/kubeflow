#!/bin/bash
# 應用 Auth Proxy 架構配置腳本
# 使用前請確保已備份現有配置

set -e

NAMESPACE="auth"
CONFIGMAP_NAME="dex"
BACKUP_FILE="dex-configmap-backup-before-authproxy-$(date +%Y%m%d-%H%M%S).yaml"
NEW_CONFIG="dex-configmap-with-authproxy.yaml"

echo "=========================================="
echo "Auth Proxy 架構配置應用腳本"
echo "=========================================="

# 1. 再次備份當前配置
echo "步驟 1: 備份當前 Dex ConfigMap..."
kubectl get configmap ${CONFIGMAP_NAME} -n ${NAMESPACE} -o yaml > ${BACKUP_FILE}
echo "✅ 備份已保存到: ${BACKUP_FILE}"

# 2. 檢查新配置文件是否存在
if [ ! -f "${NEW_CONFIG}" ]; then
    echo "❌ 錯誤: 找不到配置文件 ${NEW_CONFIG}"
    exit 1
fi

# 3. 驗證配置文件格式
echo "步驟 2: 驗證配置文件格式..."
kubectl apply --dry-run=client -f ${NEW_CONFIG}
if [ $? -ne 0 ]; then
    echo "❌ 配置文件格式錯誤，請檢查"
    exit 1
fi
echo "✅ 配置文件格式正確"

# 4. 檢查 Auth Proxy 是否已部署
echo "步驟 3: 檢查 Auth Proxy 服務..."
if ! kubectl get svc auth-proxy -n ${NAMESPACE} &>/dev/null; then
    echo "⚠️  警告: Auth Proxy 服務尚未部署"
    echo "請先部署 Auth Proxy:"
    echo "  kubectl apply -f auth-proxy/auth-proxy-deployment.yaml"
    read -p "是否繼續應用 Dex 配置？(yes/no): " CONTINUE
    if [ "$CONTINUE" != "yes" ]; then
        echo "操作已取消"
        exit 0
    fi
else
    echo "✅ Auth Proxy 服務已存在"
fi

# 5. 應用新配置
echo "步驟 4: 應用新配置..."
kubectl apply -f ${NEW_CONFIG}
if [ $? -ne 0 ]; then
    echo "❌ 應用配置失敗"
    exit 1
fi
echo "✅ 配置已應用"

# 6. 等待 Dex Pod 重啟
echo "步驟 5: 等待 Dex Pod 重啟..."
sleep 5

# 檢查 Pod 狀態
POD_NAME=$(kubectl get pods -n ${NAMESPACE} -l app=dex -o jsonpath='{.items[0].metadata.name}')
echo "Dex Pod: ${POD_NAME}"

# 等待 Pod 就緒
echo "等待 Pod 就緒..."
kubectl wait --for=condition=ready pod/${POD_NAME} -n ${NAMESPACE} --timeout=120s || {
    echo "⚠️  警告: Pod 可能未完全就緒，請手動檢查"
}

# 7. 檢查 Pod 日誌
echo ""
echo "步驟 6: 檢查 Dex Pod 日誌（最後 20 行）..."
kubectl logs ${POD_NAME} -n ${NAMESPACE} --tail=20

echo ""
echo "=========================================="
echo "配置應用完成！"
echo "=========================================="
echo "備份文件: ${BACKUP_FILE}"
echo "如果出現問題，請使用 rollback-authproxy.sh 回滾"
echo ""
echo "下一步："
echo "1. 確保 Auth Proxy 已部署並運行"
echo "2. 測試登錄流程"
echo ""


