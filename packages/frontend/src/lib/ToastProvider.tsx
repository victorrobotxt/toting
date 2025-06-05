import React, { createContext, useContext, useState, ReactNode } from 'react';

interface Toast { id: number; type: 'error' | 'success' | 'info'; message: string; }

const ToastContext = createContext<{ showToast: (t: Omit<Toast,'id'>) => void }>({ showToast: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = ({ type, message }: Omit<Toast, 'id'>) => {
    const id = Date.now();
    setToasts(t => [...t, { id, type, message }]);
    setTimeout(() => setToasts(t => t.filter(to => to.id !== id)), 5000);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        style={{
          position: 'fixed',
          bottom: '1rem',
          right: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          zIndex: 1000,
        }}
        aria-live="assertive"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid',
              borderRadius: '4px',
              background: 'white',
              color:
                t.type === 'error'
                  ? 'red'
                  : t.type === 'success'
                  ? 'green'
                  : 'black',
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
