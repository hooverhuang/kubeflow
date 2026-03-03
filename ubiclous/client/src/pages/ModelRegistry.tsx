import { useEffect, useState } from 'react';
import { getModelRegistryArtifacts } from '../api';
import './Page.css';

export default function ModelRegistry() {
  const [data, setData] = useState<{ artifacts?: unknown[]; error?: string; message?: string }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getModelRegistryArtifacts()
      .then(setData)
      .catch((e) => setData({ error: e.message }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page-loading">載入中…</div>;

  const artifacts = data.artifacts ?? [];
  const hasError = data.error || data.message;

  return (
    <div className="page">
      <h1 className="page-title">Model Registry</h1>
      <div className="page-desc-box">
        <p className="page-desc page-desc-em">
          檢視模型註冊表中的 Artifacts。若未設定 MODEL_REGISTRY_BASE 或無法連線，列表會為空。
        </p>
      </div>

      {hasError && (
        <div className="page-error" style={{ marginBottom: '1rem' }}>
          {data.error || data.message}
        </div>
      )}

      <section className="card-section">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Artifacts</th>
              </tr>
            </thead>
            <tbody>
              {Array.isArray(artifacts) && artifacts.length === 0 ? (
                <tr>
                  <td style={{ color: 'var(--text-muted)' }}>
                    尚無 Artifact，或 Model Registry 未設定
                  </td>
                </tr>
              ) : (
                Array.isArray(artifacts) &&
                (artifacts as unknown[]).map((a, i) => (
                  <tr key={i}>
                    <td>
                      <pre style={{ margin: 0, fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
                        {JSON.stringify(a, null, 2)}
                      </pre>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
