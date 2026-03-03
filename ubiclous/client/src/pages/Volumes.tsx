import { useEffect, useState } from 'react';
import { getNamespaces, getVolumes, deleteVolume } from '../api';
import './Page.css';

type Item = {
  name: string;
  namespace: string;
  capacity?: string;
  phase?: string;
  created?: string;
};

export default function Volumes() {
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [ns, setNs] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = (namespace: string) => {
    if (!namespace) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    getVolumes(namespace)
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
    if (!confirm(`確定刪除 PVC「${name}」？`)) return;
    setDeleting(name);
    deleteVolume(ns, name)
      .then(() => load(ns))
      .catch((e) => alert(e.message))
      .finally(() => setDeleting(null));
  };

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.25rem' }}>
        <div>
          <h1 className="page-title">Volumes</h1>
          <div className="page-desc-box">
            <p className="page-desc page-desc-em">
              透過 ubicloud 檢視與清理各命名空間中的 PersistentVolumeClaim。
            </p>
          </div>
        </div>
        <div className="ns-select">
          <label>命名空間</label>
          <select value={ns} onChange={(e) => setNs(e.target.value)}>
            <option value="">-- 請選擇 --</option>
            {namespaces.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="page-error">錯誤：{error}</div>}
      {loading && <div className="page-loading">載入中…</div>}

      {!loading && !error && (
        <section className="card-section">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>名稱</th>
                  <th>容量</th>
                  <th>Phase</th>
                  <th>建立時間</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ color: 'var(--text-muted)' }}>
                      此命名空間尚無 PVC
                    </td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr key={row.name}>
                      <td><code>{row.name}</code></td>
                      <td>{row.capacity || '-'}</td>
                      <td><span className="badge badge-pending">{row.phase || '-'}</span></td>
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
