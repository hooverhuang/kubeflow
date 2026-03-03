#!/bin/bash

# 更新 Kubernetes 配置，讓服務連接到本地運行的 OpenLDAP

echo "=========================================="
echo "更新 Kubernetes 配置連接到本地 OpenLDAP"
echo "=========================================="

# 獲取本地服務器 IP（假設是 hgpn108，可以根據實際情況修改）
LOCAL_HOST=$(hostname -I | awk '{print $1}')
echo "本地服務器 IP: $LOCAL_HOST"

echo ""
echo "=== 步驟 1: 更新 MySQL 同步服務配置 ==="
kubectl patch deployment mysql-ldap-sync -n auth --type='json' -p="[
  {
    \"op\": \"replace\",
    \"path\": \"/spec/template/spec/containers/0/env\",
    \"value\": [
      {\"name\": \"MYSQL_HOST\", \"value\": \"10.2.240.11\"},
      {\"name\": \"MYSQL_PORT\", \"value\": \"3306\"},
      {\"name\": \"MYSQL_DB\", \"value\": \"auth\"},
      {\"name\": \"MYSQL_USER\", \"value\": \"usagereportdb\"},
      {\"name\": \"MYSQL_PASSWORD\", \"value\": \"1@2Ma89t}yMz75kj\"},
      {\"name\": \"LDAP_SERVER\", \"value\": \"$LOCAL_HOST\"},
      {\"name\": \"LDAP_PORT\", \"value\": \"389\"},
      {\"name\": \"LDAP_BASE_DN\", \"value\": \"dc=ubilink,dc=ai\"},
      {\"name\": \"LDAP_ADMIN_DN\", \"value\": \"cn=admin,dc=ubilink,dc=ai\"},
      {\"name\": \"LDAP_ADMIN_PASSWORD\", \"value\": \"admin123\"},
      {\"name\": \"SYNC_INTERVAL\", \"value\": \"300\"}
    ]
  }
]"

echo ""
echo "=== 步驟 2: 更新 Keycloak LDAP Federation 配置腳本 ==="
sed -i "s|LDAP_SERVER=.*|LDAP_SERVER=\"$LOCAL_HOST\"|g" /root/openldap-integration/keycloak-ldap-federation.sh

echo ""
echo "=== 步驟 3: 刪除 MySQL 同步服務 Pod 讓它重新創建 ==="
kubectl delete pod -n auth -l app=mysql-ldap-sync

echo ""
echo "=========================================="
echo "✅ 配置更新完成！"
echo "=========================================="
echo ""
echo "現在："
echo "1. MySQL 同步服務會連接到 $LOCAL_HOST:389"
echo "2. Keycloak LDAP Federation 會連接到 $LOCAL_HOST:389"
echo ""
echo "請確保："
echo "- OpenLDAP 容器正在運行（docker ps | grep openldap）"
echo "- 防火牆允許 389 端口訪問"

