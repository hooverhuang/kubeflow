const express = require('express');
const cors = require('cors');
const path = require('path');
const k8s = require('@kubernetes/client-node');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 4000;

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
const k8sCustomApi = kc.makeApiClient(k8s.CustomObjectsApi);

app.use(cors());
app.use(express.json());

// 可選：轉發 Kubeflow / Model Registry 認證
const MODEL_REGISTRY_BASE = process.env.MODEL_REGISTRY_BASE || '';
const KFAM_BASE = process.env.KFAM_BASE || '';
// 設定 Kubeflow 入口（透過 Istio Gateway，需要先登入）
const KUBEFLOW_BASE_URL = process.env.KUBEFLOW_BASE_URL || 'https://kubeflow.ubilink.ai';

// TorchServe config.properties（含 grpc_inference_port），供 kserve-torchserve 從 ConfigMap 掛載，所有 namespace 共用此內容
const TORCHSERVE_CONFIG_PROPERTIES = `inference_address=http://0.0.0.0:8085
management_address=http://0.0.0.0:8085
metrics_address=http://0.0.0.0:8082
grpc_inference_port=7070
grpc_management_port=7071
enable_metrics_api=true
metrics_format=prometheus
number_of_netty_threads=4
job_queue_size=10
enable_envvars_config=true
install_py_dep_per_model=true
model_store=/mnt/models/model-store
model_snapshot={"name":"startup.cfg","modelCount":1,"models":{"mnist":{"1.0":{"defaultVersion":true,"marName":"mnist.mar","minWorkers":1,"maxWorkers":5,"batchSize":1,"maxBatchDelay":10,"responseTimeout":120}}}}
`;
const TORCHSERVE_CONFIGMAP_NAME = 'torchserve-ts-config';

// ---------- 診斷：檢查 K8s 連線與權限（方便排查 500） ----------
app.get('/api/debug/k8s', async (req, res) => {
  const out = { namespaces: null, profiles: null, kubeConfig: null };
  try {
    out.kubeConfig = {
      currentContext: kc.getCurrentContext(),
      cluster: kc.getCluster()?.name ?? null,
      user: kc.getCurrentUser()?.name ?? null,
    };
  } catch (e) {
    out.kubeConfig = { error: e.message || String(e) };
  }
  try {
    const r = await k8sApi.listNamespace();
    out.namespaces = { ok: true, count: (r.body.items || []).length };
  } catch (e) {
    out.namespaces = { ok: false, error: e.message || String(e) };
  }
  try {
    await k8sCustomApi.listClusterCustomObject('kubeflow.org', 'v1beta1', 'profiles');
    out.profiles = { ok: true };
  } catch (e) {
    try {
      await k8sCustomApi.listClusterCustomObject('kubeflow.org', 'v1', 'profiles');
      out.profiles = { ok: true };
    } catch (e2) {
      out.profiles = { ok: false, error: (e2.message || String(e2)) };
    }
  }
  res.json(out);
});

// ---------- Namespaces ----------
app.get('/api/namespaces', async (req, res) => {
  try {
    const r = await k8sApi.listNamespace();
    const namespaces = (r.body.items || [])
      .map(n => n.metadata.name)
      .filter(n => !n.startsWith('kube-'));
    res.json({ namespaces });
  } catch (e) {
    console.error('[GET /api/namespaces]', e.message || e);
    res.status(500).json({ error: e.message || String(e) });
  }
});

// ---------- KServe InferenceServices ----------
app.get('/api/kserve/:namespace', async (req, res) => {
  try {
    const { namespace } = req.params;
    const r = await k8sCustomApi.listNamespacedCustomObject(
      'serving.kserve.io', 'v1beta1', namespace, 'inferenceservices'
    );
    const items = (r.body.items || []).map(item => ({
      name: item.metadata?.name,
      namespace: item.metadata?.namespace,
      ready: item.status?.conditions?.find(c => c.type === 'Ready')?.status === 'True',
      url: item.status?.url || '',
      created: item.metadata?.creationTimestamp,
    }));
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/kserve/:namespace', async (req, res) => {
  try {
    const { namespace } = req.params;
    const { name, storageUri, modelFormat, image, cpu, memory, gpu, minReplicas } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: '缺少必要欄位：name' });
    }
    const isCustom = (modelFormat || '').toLowerCase() === 'custom';
    if (isCustom) {
      if (!image || !image.trim()) {
        return res.status(400).json({ error: 'Custom 格式請提供 image' });
      }
    } else if (!storageUri || !storageUri.trim()) {
      return res.status(400).json({ error: '缺少必要欄位：storageUri' });
    }

    const cpuReq = cpu != null ? String(cpu) : '500m';
    const memReq = memory != null ? `${memory}Gi` : '2Gi';
    const cpuLim = cpu != null ? String(Math.max(1, parseInt(cpu) || 1)) : '2';
    const memLim = memory != null ? `${Math.max(2, parseInt(memory) || 2)}Gi` : '4Gi';
    const minRep = minReplicas != null ? parseInt(minReplicas) : 1;
    const gpuNum = gpu != null ? parseInt(gpu) : 0;
    const gpuResource = 'nvidia.com/gpu';
    const resources = {
      requests: { cpu: cpuReq, memory: memReq },
      limits: { cpu: cpuLim, memory: memLim },
    };
    if (gpuNum > 0) {
      resources.requests[gpuResource] = String(gpuNum);
      resources.limits[gpuResource] = String(gpuNum);
    }
    // 僅在 GPU 節點排程，避免 control-plane 節點 driver 版本不一致（driver/library version mismatch）
    const nodeSelector = gpuNum > 0 ? { 'node-role.kubernetes.io/gpu': '' } : undefined;

    let spec;
    if (isCustom) {
      spec = {
        predictor: {
          ...(nodeSelector && { nodeSelector }),
          containers: [{
            name: 'kserve-container',
            image: image.trim(),
            resources: { ...resources },
          }],
          minReplicas: minRep >= 0 ? minRep : 1,
        },
      };
    } else {
      const fmt = modelFormat || 'huggingface';
      // PyTorch 使用 kserve-torchserve，config 由 ConfigMap torchserve-ts-config 掛載（含 grpc_inference_port）
      if (fmt === 'pytorch') {
        try {
          await k8sApi.readNamespacedConfigMap(TORCHSERVE_CONFIGMAP_NAME, namespace);
        } catch (e) {
          if (e.response?.statusCode === 404) {
            await k8sApi.createNamespacedConfigMap(namespace, {
              metadata: { name: TORCHSERVE_CONFIGMAP_NAME },
              data: { 'config.properties': TORCHSERVE_CONFIG_PROPERTIES },
            });
          } else {
            throw e;
          }
        }
        spec = {
          predictor: {
            ...(nodeSelector && { nodeSelector }),
            pytorch: {
              storageUri: storageUri.trim(),
              resources,
            },
            minReplicas: minRep >= 0 ? minRep : 1,
          },
        };
      } else {
        // UI 建立時：vLLM / Hugging Face 的 user container 名稱必須是 kserve-container，避免 webhook 拒絕
        const uri = storageUri.trim();
        const modelName = (fmt === 'vllm' || fmt === 'huggingface') ? 'kserve-container' : name.trim();
        spec = {
          predictor: {
            ...(nodeSelector && { nodeSelector }),
            model: {
              name: modelName,
              modelFormat: { name: fmt },
              storageUri: uri,
              resources,
            },
            minReplicas: minRep >= 0 ? minRep : 1,
          },
        };
      }
    }

    const inferenceService = {
      apiVersion: 'serving.kserve.io/v1beta1',
      kind: 'InferenceService',
      metadata: { name: name.trim(), namespace },
      spec,
    };

    await k8sCustomApi.createNamespacedCustomObject(
      'serving.kserve.io', 'v1beta1', namespace, 'inferenceservices', inferenceService
    );
    res.json({ ok: true, name: inferenceService.metadata.name });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.delete('/api/kserve/:namespace/:name', async (req, res) => {
  try {
    const { namespace, name } = req.params;
    await k8sCustomApi.deleteNamespacedCustomObject(
      'serving.kserve.io', 'v1beta1', namespace, 'inferenceservices', name
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- TrainJobs ----------
app.get('/api/trainer/:namespace', async (req, res) => {
  try {
    const { namespace } = req.params;
    const r = await k8sCustomApi.listNamespacedCustomObject(
      'trainer.kubeflow.org', 'v1alpha1', namespace, 'trainjobs'
    );
    const items = (r.body.items || []).map(item => ({
      name: item.metadata?.name,
      namespace: item.metadata?.namespace,
      runtimeRef: item.spec?.runtimeRef?.name,
      created: item.metadata?.creationTimestamp,
      phase: item.status?.phase || item.status?.conditions?.[0]?.type || '-',
    }));
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/trainer/:namespace/:name', async (req, res) => {
  try {
    const { namespace, name } = req.params;
    await k8sCustomApi.deleteNamespacedCustomObject(
      'trainer.kubeflow.org', 'v1alpha1', namespace, 'trainjobs', name
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Notebooks ----------
app.get('/api/notebooks/:namespace', async (req, res) => {
  try {
    const { namespace } = req.params;
    let r;
    try {
      r = await k8sCustomApi.listNamespacedCustomObject(
        'kubeflow.org', 'v1', namespace, 'notebooks'
      );
    } catch (listErr) {
      const errorCode = listErr.response?.body?.code;
      const errorMessage = listErr.response?.body?.message || listErr.message;
      if (errorCode === 403 || errorMessage?.includes('forbidden') || errorMessage?.includes('RBAC') || errorMessage?.includes('access denied')) {
        console.error(`✗ RBAC Error: Cannot list Notebooks in namespace ${namespace}. Error: ${errorMessage}`);
        return res.status(403).json({ 
          error: `RBAC: 無法讀取命名空間 ${namespace} 中的 Notebook。需要 'list notebooks' 權限。`,
          details: errorMessage 
        });
      }
      throw listErr;
    }
    
    // 檢查每個 Notebook 對應的 Pod 狀態
    const items = await Promise.all((r.body.items || []).map(async (item) => {
      const name = item.metadata?.name;
      let ready = false;
      let podPhase = '';
      
      try {
        // 檢查 Pod 狀態（Notebook Pod 命名格式：<notebook-name>-0）
        const podName = `${name}-0`;
        const pod = await k8sApi.readNamespacedPod(podName, namespace);
        if (pod.body) {
          podPhase = pod.body.status?.phase || '';
          const containerStatuses = pod.body.status?.containerStatuses || [];
          ready = containerStatuses.length > 0 && containerStatuses.every(cs => cs.ready === true);
        }
      } catch (podErr) {
        // Pod 可能還沒建立、找不到，或權限不足
        const errorCode = podErr.response?.body?.code;
        const errorMessage = podErr.response?.body?.message || podErr.message;
        if (errorCode === 403 || errorMessage?.includes('forbidden') || errorMessage?.includes('RBAC') || errorMessage?.includes('access denied')) {
          console.warn(`⚠ RBAC: Cannot read Pod ${podName} in namespace ${namespace}. Error: ${errorMessage}`);
        }
        ready = false;
      }
      
      // 構建 Notebook URL
      // 統一使用 Kubeflow 路徑（需要先登入 Kubeflow Dashboard）
      const urlPath = `/notebook/${namespace}/${name}/lab`;
      const url = KUBEFLOW_BASE_URL 
        ? `${KUBEFLOW_BASE_URL.replace(/\/$/, '')}${urlPath}`
        : urlPath;
      
      return {
        name,
        namespace: item.metadata?.namespace,
        ready,
        podPhase,
        url,
        created: item.metadata?.creationTimestamp,
      };
    }));
    
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/notebooks/:namespace', async (req, res) => {
  try {
    const { namespace } = req.params;
    const { name, image, cpu, memory, gpu, gpuVendor, workspaceVolume } = req.body;

    if (!name || !image || !cpu || !memory) {
      return res.status(400).json({ error: '缺少必要欄位：name, image, cpu, memory' });
    }

    const notebook = {
      apiVersion: 'kubeflow.org/v1',
      kind: 'Notebook',
      metadata: {
        name: name,
        namespace: namespace,
        labels: {
          'app': name,
        },
      },
      spec: {
        template: {
          spec: {
            containers: [{
              name: name,
              image: image,
              resources: {
                requests: {
                  cpu: `${cpu}`,
                  memory: `${memory}Gi`,
                },
                limits: {
                  cpu: `${cpu}`,
                  memory: `${memory}Gi`,
                },
              },
              workingDir: '/home/jovyan',
              ports: [{
                containerPort: 8888,
                name: 'notebook-port',
              }],
              // Kubeflow jupyter-web-app 會假設 volumeMounts 存在；
              // 若缺少此欄位，列出 Notebooks 可能會 500（KeyError: 'volumeMounts'）
              volumeMounts: [],
              env: [
                {
                  name: 'JUPYTER_RUNTIME_DIR',
                  value: '/tmp/jupyter-runtime',
                },
                {
                  name: 'JUPYTER_ENABLE_LAB',
                  value: 'yes',
                },
                // 允許直接訪問（禁用認證檢查）
                {
                  name: 'JUPYTER_CONFIG_DIR',
                  value: '/home/jovyan/.jupyter',
                },
              ],
              securityContext: {
                runAsUser: 1000,
                runAsGroup: 1000,
                fsGroup: 1000,
              },
            }],
            securityContext: {
              fsGroup: 1000,
            },
            serviceAccountName: 'default-editor',
          },
        },
      },
    };

    // 添加 GPU 支援
    if (gpu && parseInt(gpu) > 0) {
      const gpuResource = gpuVendor === 'nvidia' ? 'nvidia.com/gpu' : 'amd.com/gpu';
      const gpuCount = parseInt(gpu).toString();
      notebook.spec.template.spec.containers[0].resources.requests[gpuResource] = gpuCount;
      notebook.spec.template.spec.containers[0].resources.limits[gpuResource] = gpuCount;
    }

    // 建立時就加上可寫 /home/jovyan，避免存檔出現 [Errno 13] notebook_secret（不再事後補）
    // 有 workspaceVolume → 用 PVC；沒有 → 用 emptyDir + initContainer 複製 image 內容並 chown
    const homeVolumeName = 'home-jovyan';
    const initCopyAndChown = ['sh', '-c', 'cp -a /home/jovyan/. /target/ 2>/dev/null || true && mkdir -p /target/.local/share/jupyter && chown -R 1000:1000 /target'];

    if (workspaceVolume) {
      notebook.spec.template.spec.volumes = [{
        name: 'workspace',
        persistentVolumeClaim: { claimName: workspaceVolume },
      }];
      notebook.spec.template.spec.containers[0].volumeMounts = [
        { name: 'workspace', mountPath: '/home/jovyan' },
      ];
      notebook.spec.template.spec.initContainers = [{
        name: 'volume-mount-hack',
        image: 'busybox:1.36',
        command: ['sh', '-c', 'chown -R 1000:1000 /home/jovyan && chmod -R 755 /home/jovyan'],
        securityContext: { runAsUser: 0 },
        volumeMounts: [{ name: 'workspace', mountPath: '/home/jovyan' }],
      }];
    } else {
      notebook.spec.template.spec.volumes = [{ name: homeVolumeName, emptyDir: {} }];
      notebook.spec.template.spec.containers[0].volumeMounts = [
        { name: homeVolumeName, mountPath: '/home/jovyan' },
      ];
      notebook.spec.template.spec.initContainers = [{
        name: 'fix-home-permissions',
        image: image,
        command: initCopyAndChown,
        securityContext: { runAsUser: 0 },
        volumeMounts: [{ name: homeVolumeName, mountPath: '/target' }],
      }];
    }

    // 防呆：送出前再檢查一次，確保一定有 /home/jovyan 掛載
    const container = notebook.spec.template.spec.containers[0];
    if (!Array.isArray(container.volumeMounts)) container.volumeMounts = [];
    const hasHomeJovyan = container.volumeMounts.some(m => m.mountPath === '/home/jovyan');
    if (!hasHomeJovyan) {
      notebook.spec.template.spec.volumes = notebook.spec.template.spec.volumes || [];
      if (!notebook.spec.template.spec.volumes.find(v => v.name === homeVolumeName)) {
        notebook.spec.template.spec.volumes.push({ name: homeVolumeName, emptyDir: {} });
      }
      container.volumeMounts.push({ name: homeVolumeName, mountPath: '/home/jovyan' });
      notebook.spec.template.spec.initContainers = notebook.spec.template.spec.initContainers || [];
      if (!notebook.spec.template.spec.initContainers.some(ic => ic.name === 'fix-home-permissions')) {
        notebook.spec.template.spec.initContainers.push({
          name: 'fix-home-permissions',
          image: image,
          command: initCopyAndChown,
          securityContext: { runAsUser: 0 },
          volumeMounts: [{ name: homeVolumeName, mountPath: '/target' }],
        });
      }
    }
    console.log(`[Notebook ${namespace}/${name}] 建立時已掛載可寫 /home/jovyan (${workspaceVolume ? 'PVC: ' + workspaceVolume : 'emptyDir + initContainer'})`);

    const r = await k8sCustomApi.createNamespacedCustomObject(
      'kubeflow.org', 'v1', namespace, 'notebooks', notebook
    );
    
    // 創建 ClusterIP Service 和 VirtualService 讓 Notebook 可以透過 Kubeflow Gateway 訪問
    // 如果 name 是純數字，使用 notebook-<name> 作為 Service 名稱
    const svcName = /^\d+$/.test(name) ? `notebook-${name}` : name;
    let serviceCreated = false;
    let virtualServiceCreated = false;
    let serviceError = null;
    
    // 創建 ClusterIP Service（用於 VirtualService 路由）
    try {
      const service = {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          name: svcName,
          namespace: namespace,
          labels: {
            'app': name,
            'notebook-name': name,
          },
        },
        spec: {
          type: 'ClusterIP',
          selector: {
            'app': name,
          },
          ports: [{
            port: 8888,
            targetPort: 8888,
            protocol: 'TCP',
            name: 'notebook-port',
          }],
        },
      };
      
      await k8sApi.createNamespacedService(namespace, service);
      serviceCreated = true;
      console.log(`✓ Created ClusterIP Service: ${svcName} in namespace ${namespace}`);
    } catch (svcErr) {
      const errorCode = svcErr.response?.body?.code;
      const errorReason = svcErr.response?.body?.reason;
      const errorMessage = svcErr.response?.body?.message || svcErr.message;
      
      if (errorReason === 'AlreadyExists') {
        serviceCreated = true;
        console.log(`Service ${svcName} already exists, skipping...`);
      } else if (errorCode === 403 || errorMessage?.includes('forbidden') || errorMessage?.includes('RBAC') || errorMessage?.includes('access denied')) {
        serviceError = `RBAC: 無法在命名空間 ${namespace} 中創建 Service。需要 'create services' 權限。`;
        console.error(`✗ ${serviceError}`);
      } else {
        serviceError = `創建 Service 失敗: ${errorMessage}`;
        console.error(`✗ ${serviceError}`);
      }
    }
    
    // 創建 VirtualService（用於 Kubeflow Gateway 路由）
    if (serviceCreated) {
      try {
        const vsName = svcName; // VirtualService 名稱與 Service 相同
        const virtualService = {
          apiVersion: 'networking.istio.io/v1',
          kind: 'VirtualService',
          metadata: {
            name: vsName,
            namespace: namespace,
            labels: {
              'notebook-name': name,
            },
          },
          spec: {
            gateways: ['kubeflow/kubeflow-gateway'],
            hosts: ['*'],
            http: [{
              headers: {
                request: {
                  set: {},
                },
              },
              match: [{
                uri: {
                  prefix: `/notebook/${namespace}/${name}/`,
                },
              }],
              rewrite: {
                uri: `/notebook/${namespace}/${name}/`,
              },
              route: [{
                destination: {
                  host: `${svcName}.${namespace}.svc.cluster.local`,
                  port: {
                    number: 8888,
                  },
                },
              }],
            }],
          },
        };
        
        // VirtualService 是 Istio CRD，使用 CustomObjectsApi
        await k8sCustomApi.createNamespacedCustomObject(
          'networking.istio.io',
          'v1',
          namespace,
          'virtualservices',
          virtualService
        );
        virtualServiceCreated = true;
        console.log(`✓ Created VirtualService: ${vsName} in namespace ${namespace}`);
      } catch (vsErr) {
        const errorCode = vsErr.response?.body?.code;
        const errorReason = vsErr.response?.body?.reason;
        const errorMessage = vsErr.response?.body?.message || vsErr.message;
        
        if (errorReason === 'AlreadyExists') {
          virtualServiceCreated = true;
          console.log(`VirtualService ${svcName} already exists, skipping...`);
        } else {
          console.warn(`⚠ 無法創建 VirtualService: ${errorMessage}`);
          // VirtualService 創建失敗不影響 Notebook 創建
        }
      }
    }
    
    // 即使 Service/VirtualService 創建失敗，Notebook 創建仍然成功
    let message = 'Notebook 創建成功';
    if (serviceError) {
      message = `Notebook 已創建，但 ${serviceError}。`;
    } else if (serviceCreated && virtualServiceCreated) {
      message = 'Notebook 創建成功，已配置 Kubeflow Gateway 路由。';
    } else if (serviceCreated && !virtualServiceCreated) {
      message = 'Notebook 創建成功，但 VirtualService 創建失敗，可能需要手動配置路由。';
    }
    
    res.json({ 
      ok: true, 
      notebook: r.body,
      serviceCreated,
      virtualServiceCreated,
      serviceError: serviceError || undefined,
      message
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/notebooks/:namespace/:name', async (req, res) => {
  try {
    const { namespace, name } = req.params;
    await k8sCustomApi.deleteNamespacedCustomObject(
      'kubeflow.org', 'v1', namespace, 'notebooks', name
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Volumes (PVC) ----------
app.get('/api/volumes/:namespace', async (req, res) => {
  try {
    const { namespace } = req.params;
    const r = await k8sApi.listNamespacedPersistentVolumeClaim(namespace);
    const items = (r.body.items || []).map(item => ({
      name: item.metadata?.name,
      namespace: item.metadata?.namespace,
      capacity: item.status?.capacity?.storage,
      phase: item.status?.phase,
      created: item.metadata?.creationTimestamp,
    }));
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/volumes/:namespace/:name', async (req, res) => {
  try {
    const { namespace, name } = req.params;
    await k8sApi.deleteNamespacedPersistentVolumeClaim(name, namespace);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- Profiles ----------
app.get('/api/profiles', async (req, res) => {
  try {
    const r = await k8sCustomApi.listClusterCustomObject(
      'kubeflow.org', 'v1beta1', 'profiles'
    );
    const items = (r.body.items || []).map(item => ({
      name: item.metadata?.name,
      resourceVersion: item.metadata?.resourceVersion,
      created: item.metadata?.creationTimestamp,
    }));
    return res.json({ items });
  } catch (e) {
    console.error('[GET /api/profiles] v1beta1 failed:', e.message || e);
    try {
      const r2 = await k8sCustomApi.listClusterCustomObject(
        'kubeflow.org', 'v1', 'profiles'
      );
      const items = (r2.body.items || []).map(item => ({
        name: item.metadata?.name,
        created: item.metadata?.creationTimestamp,
      }));
      return res.json({ items });
    } catch (e2) {
      console.error('[GET /api/profiles] v1 failed:', e2.message || e2);
      return res.status(500).json({ error: e2.message || String(e2) });
    }
  }
});

// ---------- Model Registry proxy ----------
app.get('/api/model-registry/artifacts', async (req, res) => {
  if (!MODEL_REGISTRY_BASE) {
    return res.json({ artifacts: [], message: 'Model Registry not configured. Set MODEL_REGISTRY_BASE.' });
  }
  const url = `${MODEL_REGISTRY_BASE.replace(/\/$/, '')}/v1alpha3/artifacts?pageSize=100`;
  try {
    const ax = await axios.get(url, { validateStatus: () => true });
    res.status(ax.status).json(ax.data);
  } catch (e) {
    res.json({ artifacts: [], error: e.message });
  }
});

// 靜態前端（build 後）
app.use(express.static(path.join(__dirname, '../client/dist')));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Kubeflow UI server http://0.0.0.0:${PORT}`);
});
