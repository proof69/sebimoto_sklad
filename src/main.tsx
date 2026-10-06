import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';
import { ToastProvider } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginView } from './pages/Login';
import { configurationError } from './lib/supabase';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary>
  {configurationError ? <LoginView error={configurationError} /> : <ToastProvider><BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter></ToastProvider>}
</ErrorBoundary></StrictMode>);
