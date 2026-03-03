#!/bin/bash

# 部署 OpenLDAP 和 MySQL 同步服務

set -e

echo "=========================================="
echo "部署 OpenLDAP 和 MySQL 同步服務"
echo "=========================================="

# 步驟 1: 部署 OpenLDAP
echo ""
echo "=== 步驟 1: 部署 OpenLDAP ==="
kubectl apply -f openldap-deployment.yaml

echo "等待 OpenLDAP 啟動..."
kubectl wait --for=condition=ready pod -l app=openldap -n auth --timeout=120s || echo "等待超時，請檢查 Pod 狀態"

echo ""
echo "=== 步驟 2: 準備 MySQL 同步腳本 ConfigMap ==="
# 讀取同步腳本並創建 ConfigMap
SYNC_SCRIPT=$(cat mysql-ldap-sync.py)
kubectl create configmap mysql-ldap-sync-script \
  --from-literal=sync.py="$SYNC_SCRIPT" \
  -n auth \
  --dry-run=client -o yaml | kubectl apply -f -

echo ""
echo "=== 步驟 3: 部署 MySQL 同步服務 ==="
kubectl apply -f mysql-ldap-sync-deployment.yaml

echo "等待同步服務啟動..."
sleep 10

echo ""
echo "=== 步驟 4: 檢查服務狀態 ==="
kubectl get pods -n auth | grep -E "openldap|mysql-ldap-sync"

echo ""
echo "=========================================="
echo "✅ 部署完成！"
echo "=========================================="
echo ""
echo "下一步："
echo "1. 等待 OpenLDAP 和同步服務完全啟動（約 1-2 分鐘）"
echo "2. 執行 keycloak-ldap-federation.sh 配置 Keycloak"
echo "3. 檢查同步日誌: kubectl logs -f deployment/mysql-ldap-sync -n auth"

