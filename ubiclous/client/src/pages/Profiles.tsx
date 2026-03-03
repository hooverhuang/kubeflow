import { useEffect, useState } from 'react';
import { getProfiles } from '../api';
import './Page.css';

type Item = {
  name: string;
  created?: string;
};

export default function Profiles() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProfiles()
      .then((d) => setItems(d.items || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page-loading">載入中…</div>;
  if (error) return <div className="page-error">錯誤：{error}</div>;

  const total = items.length;

  return (
    <div className="page">
      <h1 className="page-title">Profiles</h1>
      <div className="page-desc-box">
        <p className="page-desc page-desc-em">
          檢視 Kubeflow Profiles（多租戶命名空間），由 ubicloud 提供統一入口。
        </p>
      </div>

      <section className="card-section" style={{ marginBottom: '1.25rem' }}>
        <h2>Profiles 概況</h2>
        <p className="muted">
          目前共有 {total} 個 Profiles，可作為 Notebook、KServe 等資源的多租戶邊界與資源配額單位。
        </p>
        <ul className="notebook-summary">
          <li>
            <span className="label">用途</span>
            <span className="value">用來劃分不同團隊 / 專案的命名空間與權限邊界。</span>
          </li>
          <li>
            <span className="label">建議</span>
            <span className="value">依照部門、產品線或環境（dev / staging / prod）建立對應的 Profile。</span>
          </li>
          <li>
            <span className="label">管理</span>
            <span className="value">Profile 內的資源會共用相同的配額與 RBAC 設定，方便集中治理。</span>
          </li>
        </ul>
      </section>

      <section className="card-section">
        <h2>Profiles 列表</h2>
        {items.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            尚無 Profile 或無權限讀取。
          </div>
        ) : (
          <ul className="profile-list">
            {items.map((row) => (
              <li key={row.name} className="profile-card">
                <div className="profile-card-main">
                  <div className="profile-avatar">
                    <span>{row.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="profile-meta">
                    <div className="profile-name">{row.name}</div>
                    <div className="profile-sub">
                      Profile namespace for Kubeflow workloads
                    </div>
                  </div>
                </div>
                <div className="profile-time">
                  <span className="profile-time-label">建立時間</span>
                  <span className="profile-time-value">
                    {row.created ? new Date(row.created).toLocaleString() : '-'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
