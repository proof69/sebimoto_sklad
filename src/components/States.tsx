import { AlertTriangle, Inbox, LoaderCircle, RefreshCw } from 'lucide-react';

export function Loading({ label = 'Načítání zakázek…' }: { label?: string }) {
  return <div className="state-panel" role="status"><LoaderCircle className="spin" size={30} /><p>{label}</p></div>;
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="state-panel error-panel" role="alert"><AlertTriangle size={30} /><h2>Něco se nepodařilo</h2><p>{message}</p>{onRetry && <button className="button secondary" onClick={onRetry}><RefreshCw size={18} />Zkusit znovu</button>}</div>;
}
export function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="state-panel"><div className="empty-icon"><Inbox size={30} /></div><h2>{title}</h2><p>{text}</p></div>;
}
