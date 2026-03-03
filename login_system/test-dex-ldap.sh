#!/bin/bash
# 測試 Dex LDAP 連接腳本

set -e

NAMESPACE="auth"
CONFIGMAP_NAME="dex"

echo "=========================================="
echo "Dex LDAP 連接測試"
echo "=========================================="

# 1. 檢查 Dex Pod 狀態
echo "步驟 1: 檢查 Dex Pod 狀態..."
POD_NAME=$(kubectl get pods -n ${NAMESPACE} -l app=dex -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

if [ -z "$POD_NAME" ]; then
    echo "❌ 錯誤: 找不到 Dex Pod"
    exit 1
fi

echo "Dex Pod: ${POD_NAME}"
kubectl get pod ${POD_NAME} -n ${NAMESPACE}

# 2. 檢查 Pod 日誌中的 LDAP 相關信息
echo ""
echo "步驟 2: 檢查 Dex 日誌（搜索 LDAP 相關）..."
kubectl logs ${POD_NAME} -n ${NAMESPACE} --tail=50 | grep -i "ldap\|openldap" || {
    echo "⚠️  未找到 LDAP 相關日誌（可能正常，取決於日誌級別）"
}

# 3. 檢查配置是否包含 LDAP 連接器
echo ""
echo "步驟 3: 檢查 ConfigMap 配置..."
kubectl get configmap ${CONFIGMAP_NAME} -n ${NAMESPACE} -o jsonpath='{.data.config\.yaml}' | grep -A 5 "type: ldap" || {
    echo "❌ 警告: ConfigMap 中未找到 LDAP 連接器配置"
    echo "請確認已應用 dex-configmap-with-ldap.yaml"
}

# 4. 檢查 OpenLDAP 連接性（從 Dex Pod）
echo ""
echo "步驟 4: 測試從 Dex Pod 到 OpenLDAP 的連接..."
kubectl exec ${POD_NAME} -n ${NAMESPACE} -- nc -zv 10.2.1.108 389 2>&1 || {
    echo "⚠️  警告: 無法連接到 OpenLDAP (10.2.1.108:389)"
    echo "請確認 OpenLDAP 服務正在運行且可訪問"
}

# 5. 檢查 Dex 服務狀態
echo ""
echo "步驟 5: 檢查 Dex 服務..."
kubectl get svc -n ${NAMESPACE} | grep dex

echo ""
echo "=========================================="
echo "測試完成"
echo "=========================================="
echo ""
echo "下一步："
echo "1. 訪問 Kubeflow 登錄頁面"
echo "2. 選擇 'OpenLDAP' 作為登錄方式"
echo "3. 使用 OpenLDAP 中的用戶憑證登錄"
echo ""


