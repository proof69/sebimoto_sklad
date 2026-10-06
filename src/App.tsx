import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { OrdersProvider } from './data/OrdersProvider';
import { Layout } from './components/Layout';
import { ErrorState, Loading } from './components/States';
import { Login } from './pages/Login';
import { OrdersPage } from './pages/OrdersPage';
import { useToast } from './components/Toast';
import { errorMessage } from './lib/errors';

function Protected() {
  const { session, profile, loading, error, reloadProfile, signOut } = useAuth();
  const notify = useToast();
  if (loading) return <Loading label="Ověřování přihlášení…" />;
  if (!session) return <Navigate to="/prihlaseni" replace />;
  if (!profile || error) return <main className="access-page"><ErrorState message={error ?? 'Váš účet nemá přístup do systému.'} onRetry={() => void reloadProfile()} /><button className="button secondary" onClick={() => { void signOut().catch(err => notify(errorMessage(err), 'error')); }}>Odhlásit se</button></main>;
  return <OrdersProvider key={profile.id}><Layout /></OrdersProvider>;
}

function Home() {
  return <Navigate to="/administrace" replace />;
}

export function App() {
  return <Routes>
    <Route path="/prihlaseni" element={<Login />} />
    <Route element={<Protected />}>
      <Route index element={<Home />} />
      <Route path="/sklad" element={<OrdersPage key="warehouse" mode="warehouse" />} />
      <Route path="/historie" element={<OrdersPage key="history" mode="history" />} />
      <Route path="/administrace" element={<OrdersPage key="admin" mode="admin" />} />
      <Route path="*" element={<Home />} />
    </Route>
  </Routes>;
}
