import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Page.css';

/**
 * Kubeflow OAuth 導回後的 landing 頁：
 * 設定前端登入狀態並導向 /dashboard
 */
export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.setItem('kubeflow_logged_in', 'true');
    navigate('/dashboard', { replace: true });
  }, [navigate]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      fontSize: '1rem',
    }}>
      登入成功，正在導向...
    </div>
  );
}
