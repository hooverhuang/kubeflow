# Kubeflow UI

自建前端，對接 Kubeflow 後端（KServe、Trainer、Notebooks、Volumes、Profiles、Model Registry），不含 Pipelines / Katib / TensorBoard。

## 部署網址（GitLab）

- **ubicloud 入口**：<http://10.2.240.103/kubeflow1/ubiclous>

## 需求

- Node.js 18+
- 本機可連到 Kubernetes API（`kubectl` 可用、或設定 `KUBECONFIG`）

## 安裝與啟動

### 1. 安裝依賴

```bash
cd /root/kubeflow-ui
npm install
cd client && npm install
```

或使用根目錄的 script（需在專案根目錄執行）：

```bash
npm run install:all
```

### 2. 開發模式（後端 + 前端同時跑）

在專案根目錄：

**方式 A：使用預設設定（使用 https://kubeflow.ubilink.ai）**
```bash
npm run dev
```

**方式 B：使用啟動腳本（推薦，已包含預設環境變數）**
```bash
./start.sh
```

**方式 C：自訂 Kubeflow 入口**
```bash
export KUBEFLOW_BASE_URL=https://kubeflow.ubilink.ai
npm run dev
```

**方式 D：一行指令啟動（設定環境變數）**
```bash
KUBEFLOW_BASE_URL=https://kubeflow.ubilink.ai npm run dev
```

- 後端 API：<http://localhost:4000>
- 前端：<http://localhost:5173>（Vite 會把 `/api` 轉發到 4000）

### 3. 只跑後端（例如已用其他方式提供前端）

```bash
npm run server
```

後端會讀取預設 kubeconfig（`~/.kube/config` 或 `KUBECONFIG`）與 Kubernetes API 連線。

### 4. 建置靜態前端後由後端一併提供

```bash
npm run build
npm run server
```

接著開啟 <http://localhost:4000>，後端會提供建置好的前端靜態檔。

## 環境變數

| 變數 | 說明 |
|------|------|
| `PORT` | 後端監聽 port，預設 4000 |
| `KUBECONFIG` | 未設定時使用預設 kubeconfig |
| `MODEL_REGISTRY_BASE` | Model Registry API 基礎 URL（例如 `https://kubeflow.example.com/api/model_registry`），未設定時 Model Registry 頁面會顯示未設定 |
| `KUBEFLOW_BASE_URL` | Kubeflow Gateway 的完整 URL（例如 `https://kubeflow.ubilink.ai`），設定後 Notebook URL 會是完整可點擊的連結。**注意：訪問 Notebook 前需要先登入 Kubeflow** |

## 功能說明

- **總覽**：列出命名空間與 Profiles。
- **KServe**：依 namespace 列出 InferenceService，可刪除、可開 URL。
- **Trainer**：依 namespace 列出 TrainJob，可刪除。
- **Notebooks**：依 namespace 列出 Notebook，可刪除。
- **Volumes**：依 namespace 列出 PVC，可刪除。
- **Profiles**：列出 Kubeflow Profiles。
- **Model Registry**：若已設定 `MODEL_REGISTRY_BASE`，會顯示 artifacts 列表。
