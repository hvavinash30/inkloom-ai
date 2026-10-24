import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

const ToastContext = createContext<{
  toast: (message: string, tone?: ToastTone) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const remove = useCallback((id: number) => {
    setToasts((items) => items.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = nextId.current++;
      setToasts((items) => [...items, { id, tone, message }]);
      window.setTimeout(() => remove(id), tone === 'error' ? 7000 : 4500);
    },
    [remove]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-5 sm:items-end"
        aria-live="polite"
      >
        {toasts.map((item) => {
          const Icon = item.tone === 'success' ? CheckCircle2 : item.tone === 'error' ? AlertCircle : Info;
          return (
            <div
              key={item.id}
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-white px-4 py-3 shadow-elevated ${
                item.tone === 'success'
                  ? 'border-emerald-200'
                  : item.tone === 'error'
                    ? 'border-rose-200'
                    : 'border-blue-200'
              }`}
            >
              <Icon
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  item.tone === 'success'
                    ? 'text-emerald-600'
                    : item.tone === 'error'
                      ? 'text-rose-600'
                      : 'text-blue-600'
                }`}
              />
              <p className="min-w-0 flex-1 text-sm leading-5 text-slate-700">{item.message}</p>
              <button
                type="button"
                onClick={() => remove(item.id)}
                className="mt-0.5 text-slate-400 hover:text-slate-700"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
