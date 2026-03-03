import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getNamespaces, getProfiles } from '../api';
import './Page.css';

export default function Dashboard() {
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<{ name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partialError, setPartialError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setPartialError(null);
    const errs: string[] = [];
    Promise.all([
      getNamespaces().then((ns) => ({ namespaces: ns || [] })).catch((e) => {
        errs.push('命名空間: ' + (e?.message || '無法取得'));
        return { namespaces: [] as string[] };
      }),
      getProfiles().then((pr) => ({ profiles: pr?.items || [] })).catch((e) => {
        errs.push('Profiles: ' + (e?.message || '無法取得'));
        return { profiles: [] as { name: string }[] };
      }),
    ])
      .then(([a, b]) => {
        setNamespaces(a.namespaces);
        setProfiles(b.profiles);
        if (errs.length === 2) {
          setError(errs.join('；'));
        } else if (errs.length === 1) {
          setPartialError(errs[0]);
        }
      })
      .catch((e) => {
        console.error('Dashboard error:', e);
        setError(e?.message || String(e) || '載入失敗');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="page">
        <div className="page-loading">載入中…</div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="page">
        <div className="page-error">錯誤：{error}</div>
        <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          請確認 BFF 服務（<code>/api</code>）是否已啟動，且此網域有正確代理到後端（例如 <code>ubicloud.ubilink.ai/api</code> → Node 服務）。
        </p>
      </div>
    );
  }

  const kubeflowNs = namespaces.filter(
    (n) => n.includes('kubeflow') || n.includes('user')
  );

  return (
    <div className="page">
      {partialError && (
        <div
          className="page-desc-box"
          style={{ marginBottom: '1rem', background: 'var(--danger-bg)', borderColor: 'var(--danger)', color: 'var(--danger)' }}
        >
          {partialError}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title">ubicloud 總覽</h1>
          <div className="page-desc-box">
            <p className="page-desc page-desc-em">
              從單一主控台檢視 Kubeflow 命名空間、Profiles 與常用 ML 工作負載。
            </p>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            gap: '0.6rem',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
          }}
        >
          <span
            style={{
              padding: '0.25rem 0.6rem',
              borderRadius: 999,
              background: 'rgba(56, 189, 248, 0.14)',
              color: '#7dd3fc',
            }}
          >
            {namespaces.length} namespaces
          </span>
          <span
            style={{
              padding: '0.25rem 0.6rem',
              borderRadius: 999,
              background: 'rgba(129, 140, 248, 0.16)',
              color: '#a5b4fc',
            }}
          >
            {profiles.length} profiles
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: '1.25rem', marginBottom: '1.25rem', alignItems: 'stretch' }}>
        <section className="card-section">
          <h2>命名空間</h2>
          <p className="muted">
            共 {namespaces.length} 個（含系統）。下列為與 Kubeflow / 使用者相關的命名空間：
          </p>
          <ul className="ns-list">
            {kubeflowNs.map((n) => (
              <li key={n}>
                <code>{n}</code>
              </li>
            ))}
            {kubeflowNs.length === 0 && (
              <li style={{ color: 'var(--text-muted)' }}>目前沒有符合條件的命名空間。</li>
            )}
          </ul>
        </section>

        <section className="card-section">
          <h2>Profiles</h2>
          <p className="muted">共 {profiles.length} 個 Profile，可作為 Notebook / KServe 等資源的多租戶邊界。</p>
          <ul className="ns-list">
            {profiles.map((p) => (
              <li key={p.name}>
                <code>{p.name}</code>
              </li>
            ))}
            {profiles.length === 0 && (
              <li style={{ color: 'var(--text-muted)' }}>尚無 Profile 或目前帳號無權限讀取。</li>
            )}
          </ul>
        </section>
      </div>

      <section className="card-section">
        <h2>功能入口</h2>
        <p className="muted" style={{ marginBottom: '0.9rem' }}>
          常用工作負載與管理介面，一鍵跳轉：
        </p>
        <div className="quick-links">
          <Link to="/kserve" className="quick-link">KServe 推論服務</Link>
          <Link to="/trainer" className="quick-link">Trainer 訓練任務</Link>
          <Link to="/notebooks" className="quick-link">Notebooks</Link>
          <Link to="/volumes" className="quick-link">Volumes</Link>
          <Link to="/profiles" className="quick-link">Profiles</Link>
          <Link to="/model-registry" className="quick-link">Model Registry</Link>
        </div>
      </section>
    </div>
  );
}
