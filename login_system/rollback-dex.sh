#!/bin/bash
# Dex 配置回滾腳本

set -e

NAMESPACE="auth"
CONFIGMAP_NAME="dex"

echo "=========================================="
echo "Dex 配置回滾腳本"
echo "=========================================="

# 列出所有備份文件
echo "可用的備份文件："
ls -1t dex-configmap-backup-*.yaml 2>/dev/null | nl

if [ $? -ne 0 ] || [ -z "$(ls -1 dex-configmap-backup-*.yaml 2>/dev/null)" ]; then
    echo "❌ 找不到備份文件"
    exit 1
fi

# 詢問要恢復的備份
echo ""
read -p "請輸入要恢復的備份文件名（或按 Enter 使用最新的）: " BACKUP_FILE

if [ -z "$BACKUP_FILE" ]; then
    BACKUP_FILE=$(ls -1t dex-configmap-backup-*.yaml | head -1)
    echo "使用最新備份: ${BACKUP_FILE}"
fi

# 檢查備份文件是否存在
if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ 錯誤: 備份文件 ${BACKUP_FILE} 不存在"
    exit 1
fi

# 確認操作
echo ""
echo "⚠️  警告: 即將恢復到備份配置"
echo "備份文件: ${BACKUP_FILE}"
read -p "確認繼續？(yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "操作已取消"
    exit 0
fi

# 恢復配置
echo ""
echo "步驟 1: 恢復 ConfigMap..."
kubectl apply -f ${BACKUP_FILE}
if [ $? -ne 0 ]; then
    echo "❌ 恢復配置失敗"
    exit 1
fi
echo "✅ 配置已恢復"

# 等待 Pod 重啟
echo ""
echo "步驟 2: 等待 Dex Pod 重啟..."
sleep 5

# 檢查 Pod 狀態
POD_NAME=$(kubectl get pods -n ${NAMESPACE} -l app=dex -o jsonpath='{.items[0].metadata.name}')
echo "Dex Pod: ${POD_NAME}"

# 等待 Pod 就緒
echo "等待 Pod 就緒..."
kubectl wait --for=condition=ready pod/${POD_NAME} -n ${NAMESPACE} --timeout=120s || {
    echo "⚠️  警告: Pod 可能未完全就緒，請手動檢查"
}

# 檢查 Pod 日誌
echo ""
echo "步驟 3: 檢查 Dex Pod 日誌（最後 20 行）..."
kubectl logs ${POD_NAME} -n ${NAMESPACE} --tail=20

echo ""
echo "=========================================="
echo "回滾完成！"
echo "=========================================="


