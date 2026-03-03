import { useEffect, useState } from 'react';
import { getNamespaces, getNotebooks, deleteNotebook, createNotebook, getVolumes } from '../api';
import './Page.css';
import './NotebookForm.css';

type Item = {
  name: string;
  namespace: string;
  ready: boolean;
  podPhase?: string;
  url?: string;
  directUrl?: string | null;
  created?: string;
};

type NotebookType = 'jupyterlab' | 'vscode' | 'rstudio' | 'custom';

const NOTEBOOK_IMAGES: Record<NotebookType, string> = {
  jupyterlab: 'kubeflow-harbor.ubilink.ai/public-images/many_tool_for_notebook:1.0',
  vscode: 'kubeflow-harbor.ubilink.ai/public-images/vscode-notebook:latest',
  rstudio: 'kubeflow-harbor.ubilink.ai/public-images/rstudio-notebook:latest',
  custom: '',
};

const IMAGE_OPTIONS = [
  { value: 'jupyterlab', label: 'kubeflow-harbor.ubilink.ai/public-images/many_tool_for_notebook:1.0' },
  { value: 'vscode', label: 'kubeflow-harbor.ubilink.ai/public-images/vscode-notebook:latest' },
  { value: 'rstudio', label: 'kubeflow-harbor.ubilink.ai/public-images/rstudio-notebook:latest' },
  { value: 'custom', label: '自訂 Image…' },
] as const;

export default function Notebooks() {
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [ns, setNs] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [volumes, setVolumes] = useState<{ name: string }[]>([]);
  const [customSectionOpen, setCustomSectionOpen] = useState(false);
  const [advancedOptionsOpen, setAdvancedOptionsOpen] = useState(false);

  // 表單狀態
  const [formData, setFormData] = useState({
    name: '',
    notebookType: 'jupyterlab' as NotebookType,
    customImage: '',
    cpu: '8',
    memory: '16',
    gpu: '',
    gpuVendor: 'nvidia',
    workspaceVolume: '',
  });

  const load = (namespace: string) => {
    if (!namespace) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([
      getNotebooks(namespace),
      getVolumes(namespace).catch(() => ({ items: [] })),
    ])
      .then(([nb, vol]) => {
        setItems(nb.items || []);
        setVolumes(vol.items || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    getNamespaces()
      .then((list) => {
        if (!list || list.length === 0) {
          setError('無法載入命名空間列表');
          return;
        }
        setNamespaces(list);
        const kubeflow = list.find((n) => n.includes('kubeflow-user') || (n.includes('user') && !n.includes('system')));
        const next = kubeflow || list.find((n) => !n.includes('system') && !n.includes('kube-')) || list[0] || '';
        setNs(next);
        if (next) load(next);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (ns) load(ns);
  }, [ns]);

  const handleDelete = (name: string) => {
    if (!confirm(`確定刪除 Notebook「${name}」？`)) return;
    setDeleting(name);
    deleteNotebook(ns, name)
      .then(() => load(ns))
      .catch((e) => alert(e.message))
      .finally(() => setDeleting(null));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('請輸入名稱');
      return;
    }

    const image = formData.notebookType === 'custom'
      ? formData.customImage.trim()
      : NOTEBOOK_IMAGES[formData.notebookType];

    if (!image) {
      alert('請選擇或輸入 Image');
      return;
    }

    try {
      const result = await createNotebook(ns, {
        name: formData.name.trim(),
        image,
        cpu: parseInt(formData.cpu),
        memory: parseInt(formData.memory),
        gpu: formData.gpu ? parseInt(formData.gpu) : undefined,
        gpuVendor: formData.gpu ? formData.gpuVendor : undefined,
        workspaceVolume: formData.workspaceVolume || undefined,
      });
      
      // 顯示結果訊息（包括 Service 創建的警告）
      if (result.serviceError) {
        alert(`Notebook 已創建，但 ${result.serviceError}\n\n您可以稍後手動創建 Service 或使用 Kubeflow 路徑訪問。`);
      } else if (result.message) {
        alert(result.message);
      }
      
      setShowForm(false);
      setFormData({
        name: '',
        notebookType: 'jupyterlab',
        customImage: '',
        cpu: '8',
        memory: '16',
        gpu: '',
        gpuVendor: 'nvidia',
        workspaceVolume: '',
      });
      load(ns);
    } catch (e: any) {
      alert(e.message || '建立失敗');
    }
  };

  const total = items.length;
  const readyCount = items.filter((i) => i.ready).length;

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.25rem' }}>
        <div>
          <h1 className="page-title">Notebooks</h1>
          <div className="page-desc-box">
            <p className="page-desc page-desc-em">
              在 ubicloud 統一管理你的 Notebook 工作空間，透過 Kubeflow 認證安全連線；若尚未登入，系統會自動帶你完成登入流程。
            </p>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? '取消' : '+ 新增 Notebook'}
        </button>
      </div>

      {showForm && (
        <form className="notebook-form" onSubmit={handleSubmit}>
          <h2>新增 Notebook</h2>

          <div className="form-group">
            <label>名稱 *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="notebook-name"
              required
            />
          </div>

          <div className="custom-notebook-card">
            <button
              type="button"
              className="custom-notebook-header"
              onClick={() => setCustomSectionOpen(!customSectionOpen)}
              aria-expanded={customSectionOpen}
            >
              <span className="custom-notebook-title">Custom Notebook</span>
              <span className="custom-notebook-chevron">{customSectionOpen ? '▲' : '▼'}</span>
            </button>
            {customSectionOpen && (
              <div className="custom-notebook-body">
                <div className="form-group">
                  <label>Image *</label>
                  <select
                    value={formData.notebookType}
                    onChange={(e) => setFormData({ ...formData, notebookType: e.target.value as NotebookType })}
                  >
                    {IMAGE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                {formData.notebookType === 'custom' && (
                  <div className="form-group">
                    <label>自訂 Image URL *</label>
                    <input
                      type="text"
                      value={formData.customImage}
                      onChange={(e) => setFormData({ ...formData, customImage: e.target.value })}
                      placeholder="registry/path/image:tag"
                    />
                  </div>
                )}
                <button
                  type="button"
                  className="advanced-options-trigger"
                  onClick={() => setAdvancedOptionsOpen(!advancedOptionsOpen)}
                  aria-expanded={advancedOptionsOpen}
                >
                  <span className="advanced-options-chevron">{advancedOptionsOpen ? '▲' : '▼'}</span>
                  Advanced Options
                </button>
              </div>
            )}
          </div>

          {advancedOptionsOpen && (
            <>
          <div className="form-group">
            <label>CPU / RAM</label>
            <div className="form-row">
              <div className="form-col">
                <label>Minimum CPU *</label>
                <input
                  type="number"
                  value={formData.cpu}
                  onChange={(e) => setFormData({ ...formData, cpu: e.target.value })}
                  min="1"
                  required
                />
              </div>
              <div className="form-col">
                <label>Minimum Memory (Gi) *</label>
                <input
                  type="number"
                  value={formData.memory}
                  onChange={(e) => setFormData({ ...formData, memory: e.target.value })}
                  min="1"
                  required
                />
              </div>
            </div>
          </div>

          <div className="form-group">
            <label>GPUs</label>
            <div className="form-row">
              <div className="form-col">
                <label>Number of GPUs</label>
                <input
                  type="number"
                  value={formData.gpu}
                  onChange={(e) => setFormData({ ...formData, gpu: e.target.value })}
                  min="0"
                  placeholder="0"
                />
              </div>
              <div className="form-col">
                <label>GPU Vendor</label>
                <select
                  value={formData.gpuVendor}
                  onChange={(e) => setFormData({ ...formData, gpuVendor: e.target.value })}
                  disabled={!formData.gpu || parseInt(formData.gpu) === 0}
                >
                  <option value="nvidia">NVIDIA</option>
                  <option value="amd">AMD</option>
                </select>
              </div>
            </div>
          </div>

          <div className="form-group">
            <label>Workspace Volume</label>
            <select
              value={formData.workspaceVolume}
              onChange={(e) => setFormData({ ...formData, workspaceVolume: e.target.value })}
            >
              <option value="">-- 不使用 Volume --</option>
              {volumes.map((v) => (
                <option key={v.name} value={v.name}>{v.name}</option>
              ))}
            </select>
            <small>Volume 會掛載到 /home/jovyan</small>
          </div>
            </>
          )}

          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setShowForm(false)}>
              取消
            </button>
            <button type="submit" className="btn btn-primary">
              建立
            </button>
          </div>
        </form>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 2fr)', gap: '1.25rem' }}>
        <section className="card-section">
          <h2>Notebook 概況</h2>
          <p className="muted">
            目前命名空間 <code>{ns || '（尚未選擇）'}</code> 中共有 {total} 個 Notebook，
            其中 {readyCount} 個為 Ready。
          </p>
          <ul className="notebook-summary">
            <li>
              <span className="label">Ready</span>
              <span className="value">Pod 已就緒，可立即透過「連接 Notebook」開啟工作環境。</span>
            </li>
            <li>
              <span className="label">Pending</span>
              <span className="value">等待資源排程（CPU / GPU / Volume）或 Pod 啟動中。</span>
            </li>
            <li>
              <span className="label">建議</span>
              <span className="value">以 Profile / 命名空間為邏輯邊界管理 Notebook，方便控管資源與權限。</span>
            </li>
          </ul>
        </section>

        <section className="card-section">
          <div className="ns-select" style={{ marginBottom: '0.75rem' }}>
            <label>命名空間</label>
            <select value={ns} onChange={(e) => setNs(e.target.value)}>
              <option value="">-- 請選擇 --</option>
              {namespaces.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          {error && <div className="page-error">錯誤：{error}</div>}
          {loading && <div className="page-loading">載入中…</div>}

          {!loading && !error && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>名稱</th>
                    <th>狀態</th>
                    <th>URL</th>
                    <th>建立時間</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ color: 'var(--text-muted)' }}>
                        此命名空間尚無 Notebook
                      </td>
                    </tr>
                  ) : (
                    items.map((row) => (
                      <tr key={row.name}>
                        <td><code>{row.name}</code></td>
                        <td>
                          <span className={row.ready ? 'badge badge-ok' : 'badge badge-pending'}>
                            {row.ready ? 'Ready' : row.podPhase || 'Pending'}
                          </span>
                        </td>
                        <td>
                          {row.url ? (
                            <a 
                              href={row.url} 
                              target="_blank" 
                              rel="noreferrer"
                              className="btn btn-primary"
                              style={{ fontSize: '0.85rem', padding: '0.35rem 0.75rem', display: 'inline-block' }}
                            >
                              連接 Notebook
                            </a>
                          ) : '-'}
                        </td>
                        <td>{row.created ? new Date(row.created).toLocaleString() : '-'}</td>
                        <td>
                          <button
                            className="btn btn-danger"
                            onClick={() => handleDelete(row.name)}
                            disabled={deleting === row.name}
                          >
                        {deleting === row.name ? '刪除中…' : '刪除'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
