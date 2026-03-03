#!/bin/bash
# Kubeflow UI 啟動腳本

# 設定環境變數（可選，可透過環境變數覆蓋）
export KUBEFLOW_BASE_URL=${KUBEFLOW_BASE_URL:-"https://kubeflow.ubilink.ai"}
export MODEL_REGISTRY_BASE=${MODEL_REGISTRY_BASE:-""}
export PORT=${PORT:-4000}

# 進入專案目錄
cd "$(dirname "$0")"

echo "啟動 Kubeflow UI..."
echo "KUBEFLOW_BASE_URL=$KUBEFLOW_BASE_URL"
echo "PORT=$PORT"

# 啟動服務（環境變數會自動傳遞給子進程）
npm run dev
