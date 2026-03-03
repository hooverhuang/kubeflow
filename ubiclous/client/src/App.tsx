import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import KServe from './pages/KServe';
import Trainer from './pages/Trainer';
import Notebooks from './pages/Notebooks';
import Volumes from './pages/Volumes';
import Profiles from './pages/Profiles';
import ModelRegistry from './pages/ModelRegistry';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';

const nav = [
  { to: '/dashboard', label: '總覽' },
  { to: '/kserve', label: 'KServe' },
  { to: '/trainer', label: 'Trainer' },
  { to: '/notebooks', label: 'Notebooks' },
  { to: '/volumes', label: 'Volumes' },
  { to: '/profiles', label: 'Profiles' },
  { to: '/model-registry', label: 'Model Registry' },
];

// 檢查是否已登入
function RequireAuth({ children }: { children: React.ReactNode }) {
  const isLoggedIn = localStorage.getItem('kubeflow_logged_in') === 'true';
  
  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route
        path="*"
        element={
          <RequireAuth>
            <Layout
              sidebar={
                <nav className="sidebar-nav">
                  {nav.map(({ to, label }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={to === '/'}
                      className={({ isActive }) => (isActive ? 'active' : '')}
                    >
                      {label}
                    </NavLink>
                  ))}
                </nav>
              }
            >
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/kserve" element={<KServe />} />
                <Route path="/trainer" element={<Trainer />} />
                <Route path="/notebooks" element={<Notebooks />} />
                <Route path="/volumes" element={<Volumes />} />
                <Route path="/profiles" element={<Profiles />} />
                <Route path="/model-registry" element={<ModelRegistry />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Layout>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
