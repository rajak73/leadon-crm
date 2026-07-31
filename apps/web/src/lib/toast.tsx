import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'warning' | 'info';
interface ToastItem { id: number; kind: ToastKind; message: string; }

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const DURATION_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId.current++;
    setItems((list) => [...list, { id, kind, message }]);
    setTimeout(() => dismiss(id), DURATION_MS);
  }, [dismiss]);

  const api: ToastApi = {
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    warning: (m) => push('warning', m),
    info: (m) => push('info', m),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        style={{
          position: 'fixed', top: 16, right: 16, zIndex: 100,
          display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360, width: 'calc(100vw - 32px)',
        }}
      >
        {items.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <div
              key={t.id}
              className="card card-pad toast-in"
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, borderLeft: `3px solid var(--${t.kind === 'error' ? 'danger' : t.kind === 'success' ? 'success' : t.kind})` }}
            >
              <Icon size={18} style={{ flexShrink: 0, marginTop: 1, color: `var(--${t.kind === 'error' ? 'danger-text' : t.kind === 'success' ? 'success-text' : t.kind === 'warning' ? 'warning-text' : 'primary-600'})` }} />
              <div style={{ flex: 1, fontSize: 13.5, minWidth: 0 }}>{t.message}</div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--muted)', flexShrink: 0, display: 'grid', placeItems: 'center' }}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
