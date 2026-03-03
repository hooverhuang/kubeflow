import { useEffect, useState } from 'react';
import { getNamespaces, getKServe, deleteKServe, createKServe } from '../api';
import './Page.css';

type Item = {
  name: string;
  namespace: string;
  ready: boolean;
  url: string;
  created?: string;
};

const DEFAULT_STORAGE_URI = 'hf://Qwen/Qwen2-0.5B-Instruct';

const MODEL_FORMAT_OPTIONS: { value: string; label: string }[] = [
  { value: 'huggingface', label: 'Hugging Face' },
  { value: 'vllm', label: 'vLLM' },
];

export default function KServe() {
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [ns, setNs] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    storageUri: DEFAULT_STORAGE_URI,
    modelFormat: 'vllm',
    image: '',
    cpu: '1',
    memory: '2',
    gpu: '',
    minReplicas: '1',
  });

  const load = (namespace: string) => {
    if (!namespace) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    getKServe(namespace)
      .then((d) => setItems(d.items || []))
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
        // 優先選擇 kubeflow-user 相關的命名空間
        const kubeflow = list.find((n) => n.includes('kubeflow-user') || (n.includes('user') && !n.includes('system')));
        // 如果沒有，選擇第一個非系統命名空間
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
    if (!confirm(`確定刪除 InferenceService「${name}」？`)) return;
    setDeleting(name);
    deleteKServe(ns, name)
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
    const isCustom = formData.modelFormat === 'custom';
    if (isCustom) {
      if (!formData.image.trim()) {
        alert('Custom 格式請輸入 Image URL');
        return;
      }
    } else if (!formData.storageUri.trim()) {
      alert('請輸入 Model 來源（storageUri）');
      return;
    }
    if (!ns) {
      alert('請選擇命名空間');
      return;
    }
    setSubmitting(true);
    try {
      await createKServe(ns, {
        name: formData.name.trim(),
        storageUri: formData.storageUri.trim() || undefined,
        modelFormat: formData.modelFormat,
        image: formData.image.trim() || undefined,
        cpu: formData.cpu,
        memory: formData.memory,
        gpu: formData.gpu ? parseInt(formData.gpu, 10) : undefined,
        minReplicas: parseInt(formData.minReplicas, 10) || 1,
      });
      setShowForm(false);
      setFormData({
        name: '',
        storageUri: DEFAULT_STORAGE_URI,
        modelFormat: 'vllm',
        image: '',
        cpu: '1',
        memory: '2',
        gpu: '',
        minReplicas: '1',
      });
      load(ns);
    } catch (err: unknown) {
      alert((err as Error)?.message || '建立失敗');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.25rem' }}>
        <div>
          <h1 className="page-title">KServe 服務</h1>
          <div className="page-desc-box">
            <p className="page-desc page-desc-em">
              透過 ubicloud 檢視與管理命名空間中的 KServe InferenceService。
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="ns-select" style={{ marginBottom: 0 }}>
            <label>命名空間</label>
            <select value={ns} onChange={(e) => setNs(e.target.value)}>
              <option value="">-- 請選擇 --</option>
              {namespaces.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? '取消' : '+ 新增 InferenceService'}
          </button>
        </div>
      </div>

      {showForm && (
        <section className="card-section" style={{ marginBottom: '1.25rem' }}>
          <h2>新增 InferenceService</h2>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '32rem' }}>
            <div className="form-group">
              <label>名稱 *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="例如 my-model"
                required
              />
            </div>
            {formData.modelFormat !== 'custom' && (
              <div className="form-group">
                <label>Model 來源 (storageUri) *</label>
                <input
                  type="text"
                  value={formData.storageUri}
                  onChange={(e) => setFormData({ ...formData, storageUri: e.target.value })}
                  placeholder="hf://org/model（vLLM 常用）或 s3://、pvc:// ..."
                  required
                />
                <p style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  vLLM: hf://org/model · S3: s3://bucket/path · PVC: pvc://name/path
                </p>
              </div>
            )}
            <div className="form-group">
              <label>Model 格式</label>
              <select
                value={formData.modelFormat}
                onChange={(e) => setFormData({ ...formData, modelFormat: e.target.value })}
              >
                {MODEL_FORMAT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            {formData.modelFormat === 'custom' && (
              <div className="form-group">
                <label>Image URL *</label>
                <input
                  type="text"
                  value={formData.image}
                  onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                  placeholder="registry/path/image:tag"
                />
              </div>
            )}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: '1 1 6rem' }}>
                <label>CPU</label>
                <input
                  type="text"
                  value={formData.cpu}
                  onChange={(e) => setFormData({ ...formData, cpu: e.target.value })}
                  placeholder="1"
                />
              </div>
              <div className="form-group" style={{ flex: '1 1 6rem' }}>
                <label>Memory (Gi)</label>
                <input
                  type="text"
                  value={formData.memory}
                  onChange={(e) => setFormData({ ...formData, memory: e.target.value })}
                  placeholder="2"
                />
              </div>
              <div className="form-group" style={{ flex: '1 1 6rem' }}>
                <label>Min Replicas</label>
                <input
                  type="number"
                  min="0"
                  value={formData.minReplicas}
                  onChange={(e) => setFormData({ ...formData, minReplicas: e.target.value })}
                />
              </div>
            </div>
            <div className="form-group" style={{ maxWidth: '8rem' }}>
              <label>GPU 數量</label>
              <input
                type="number"
                min="0"
                value={formData.gpu}
                onChange={(e) => setFormData({ ...formData, gpu: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? '建立中…' : '建立'}
              </button>
            </div>
          </form>
        </section>
      )}

      {error && <div className="page-error">錯誤：{error}</div>}
      {loading && <div className="page-loading">載入中…</div>}

      {!loading && !error && (
        <section className="card-section">
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
                      此命名空間尚無 InferenceService
                    </td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr key={row.name}>
                      <td><code>{row.name}</code></td>
                      <td>
                        <span className={row.ready ? 'badge badge-ok' : 'badge badge-pending'}>
                          {row.ready ? 'Ready' : 'Pending'}
                        </span>
                      </td>
                      <td>
                        {row.url ? (
                          <a href={row.url} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: '0.85rem' }}>
                            {row.url}
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
        </section>
      )}
    </div>
  );
}
