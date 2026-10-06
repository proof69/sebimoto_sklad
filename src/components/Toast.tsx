import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, CircleAlert, X } from 'lucide-react';

type Notification = { id: number; message: string; tone: 'success' | 'error' };
const ToastContext = createContext<(message: string, tone?: Notification['tone']) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const nextId = useRef(0);
  const notify = useCallback((message: string, tone: Notification['tone'] = 'success') => {
    const id = ++nextId.current;
    setNotifications(current => [...current.slice(-3), { id, message, tone }]);
    setTimeout(() => setNotifications(current => current.filter(item => item.id !== id)), tone === 'error' ? 10_000 : 6000);
  }, []);
  return <ToastContext.Provider value={notify}>
    {children}
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {notifications.map(item => <div className={`toast ${item.tone}`} key={item.id} role={item.tone === 'error' ? 'alert' : 'status'}>
        {item.tone === 'success' ? <CheckCircle2 size={21} /> : <CircleAlert size={21} />}
        <span>{item.message}</span>
        <button aria-label="Zavřít oznámení" className="icon-button" onClick={() => setNotifications(current => current.filter(n => n.id !== item.id))}><X size={18} /></button>
      </div>)}
    </div>
  </ToastContext.Provider>;
}
export function useToast() { return useContext(ToastContext); }
