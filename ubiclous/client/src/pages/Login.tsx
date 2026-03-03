import { useNavigate } from 'react-router-dom';
import './Page.css';

export default function Login() {
  const navigate = useNavigate();

  const handleLoginClick = () => {
    // 登入後導回 /auth/callback，該頁會設定登入狀態並導向 /dashboard
    const redirectUrl = 'https://ubicloud.ubilink.ai/auth/callback';
    window.location.href = `https://kubeflow.ubilink.ai/oauth2/start?rd=${encodeURIComponent(redirectUrl)}`;
  };

  const handleContinue = () => {
    // 標記為已登入並進入系統
    localStorage.setItem('kubeflow_logged_in', 'true');
    navigate('/dashboard');
  };

  const handleSkipLogin = () => {
    // 跳過登入，直接進入系統（用於測試或已在其他地方登入的情況）
    localStorage.setItem('kubeflow_logged_in', 'true');
    navigate('/dashboard');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        background:
          'radial-gradient(circle at top left, #1d4ed8 0, transparent 55%), radial-gradient(circle at bottom right, #0ea5e9 0, transparent 55%), #020617',
        color: '#e2e8f0',
        fontFamily: '"Outfit", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      {/* 左側品牌區 */}
      <div
        style={{
          flex: 1.1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '3.5rem 3.5rem 3rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '2.5rem' }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                background: 'linear-gradient(135deg, #38bdf8, #6366f1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 0 1px rgba(15,23,42,0.7)',
              }}
            >
              <span style={{ fontSize: 18, fontWeight: 700, color: '#0b1220' }}>u</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span
                style={{
                  fontSize: '1.4rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'lowercase',
                }}
              >
                ubicloud
              </span>
              <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>machine learning workspace</span>
            </div>
          </div>

          <h1
            style={{
              fontSize: '2.4rem',
              lineHeight: 1.2,
              margin: '0 0 0.75rem',
              fontWeight: 600,
            }}
          >
            一個入口，串起<br />
            Kubeflow 的所有能力
          </h1>
          <p
            style={{
              margin: 0,
              maxWidth: 420,
              fontSize: '0.98rem',
              color: '#9ca3af',
            }}
          >
            透過 ubicloud，集中管理 Notebook、推論服務、訓練任務與 Profiles，
            不再在多個 Kubeflow 頁面之間來回切換。
          </p>
        </div>

        <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
          <span style={{ opacity: 0.9 }}>Tip：</span>
          已在 Kubeflow 完成登入時，可直接點選下方「我已登入 ubicloud，繼續使用」快速進入。
        </div>
      </div>

      {/* 右側登入卡片 */}
      <div
        style={{
          flex: 0.9,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '3.5rem 3.5rem 3rem 0',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 420,
            background: 'rgba(15,23,42,0.9)',
            borderRadius: 20,
            padding: '2.4rem 2.3rem',
            boxShadow: '0 24px 60px rgba(15,23,42,0.9)',
            border: '1px solid rgba(148,163,184,0.35)',
            backdropFilter: 'blur(18px)',
          }}
        >
          <div style={{ marginBottom: '1.8rem' }}>
            <p
              style={{
                fontSize: '0.8rem',
                textTransform: 'uppercase',
                letterSpacing: '0.16em',
                color: '#818cf8',
                margin: '0 0 0.75rem',
              }}
            >
              sign in
            </p>
            <h2
              style={{
                fontSize: '1.35rem',
                margin: 0,
                fontWeight: 600,
              }}
            >
              登入 ubicloud
            </h2>
            <p
              style={{
                margin: '0.4rem 0 0',
                fontSize: '0.9rem',
                color: '#9ca3af',
              }}
            >
              你會被導向 Kubeflow 的 OAuth 頁面完成驗證，之後自動回到此處。
            </p>
          </div>

          <button
            onClick={handleLoginClick}
            className="btn btn-primary"
            style={{
              width: '100%',
              padding: '0.85rem 1.6rem',
              fontSize: '0.98rem',
              fontWeight: 600,
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              background: 'linear-gradient(135deg, #38bdf8 0%, #6366f1 50%, #a855f7 100%)',
              color: 'white',
              boxShadow: '0 14px 40px rgba(56,189,248,0.40)',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease',
              marginBottom: '1.1rem',
            }}
            onMouseOver={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow =
                '0 18px 50px rgba(56,189,248,0.55)';
              (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.03)';
            }}
            onMouseOut={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'none';
              (e.currentTarget as HTMLButtonElement).style.boxShadow =
                '0 14px 40px rgba(56,189,248,0.40)';
              (e.currentTarget as HTMLButtonElement).style.filter = 'none';
            }}
          >
            使用 Kubeflow 帳號登入
          </button>

          <div
            style={{
              margin: '1.2rem 0 1.1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              color: '#6b7280',
              fontSize: '0.8rem',
            }}
          >
            <div style={{ flex: 1, height: 1, background: 'rgba(55,65,81,0.9)' }} />
            <span>或</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(55,65,81,0.9)' }} />
          </div>

          <button
            onClick={handleContinue}
            className="btn"
            style={{
              width: '100%',
              padding: '0.8rem 1.2rem',
              fontSize: '0.9rem',
              borderRadius: 999,
              background: 'rgba(15,23,42,0.7)',
              color: '#e5e7eb',
              border: '1px solid rgba(148,163,184,0.5)',
              marginBottom: '0.5rem',
            }}
          >
            我已登入 ubicloud，繼續使用
          </button>

          <button
            onClick={handleSkipLogin}
            style={{
              width: '100%',
              padding: '0.45rem 1rem',
              fontSize: '0.8rem',
              background: 'transparent',
              color: '#9ca3af',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            跳過（稍後登入）
          </button>

          <p
            style={{
              marginTop: '1.2rem',
              fontSize: '0.78rem',
              color: '#6b7280',
            }}
          >
            若瀏覽器無法自動跳轉，請手動前往{' '}
            <code style={{ color: '#38bdf8' }}>https://ubicloud.ubilink.ai</code>。
          </p>
        </div>
      </div>
    </div>
  );
}
