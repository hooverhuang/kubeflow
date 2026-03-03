#!/bin/bash

# 在本地服務器部署 OpenLDAP Docker 容器

echo "=========================================="
echo "部署 OpenLDAP Docker 容器"
echo "=========================================="

# 檢查 Docker 是否安裝
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安裝，請先安裝 Docker"
    exit 1
fi

echo ""
echo "=== 步驟 1: 停止並刪除現有容器（如果存在）==="
docker stop openldap 2>/dev/null || true
docker rm openldap 2>/dev/null || true

echo ""
echo "=== 步驟 2: 拉取鏡像 ==="
docker pull swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/bitnami/openldap:2.6-debian-12

echo ""
echo "=== 步驟 3: 啟動 OpenLDAP 容器 ==="
docker-compose -f /root/openldap-integration/docker-compose.yml up -d

echo ""
echo "=== 等待 10 秒讓容器啟動 ==="
sleep 10

echo ""
echo "=== 步驟 4: 檢查容器狀態 ==="
docker ps | grep openldap

echo ""
echo "=== 步驟 5: 檢查容器日誌 ==="
docker logs openldap --tail=30

echo ""
echo "=========================================="
echo "✅ OpenLDAP 容器部署完成！"
echo "=========================================="
echo ""
echo "OpenLDAP 運行在："
echo "  - LDAP: localhost:389"
echo "  - LDAPS: localhost:636"
echo ""
echo "管理員帳號：admin"
echo "管理員密碼：admin123"
echo "Base DN: dc=ubilink,dc=ai"
echo ""
echo "下一步："
echo "1. 更新 MySQL 同步服務配置，連接到本地 OpenLDAP"
echo "2. 更新 Keycloak LDAP Federation 配置"

