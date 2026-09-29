'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type Toast = (text: string, bad?: boolean) => void;

const ToastContext = createContext<Toast>(() => {});

export function useToast(): Toast {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({ text: '', bad: false, show: false });
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const toast = useCallback<Toast>((text, bad = false) => {
    setState({ text, bad, show: true });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState((s) => ({ ...s, show: false })), 2600);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className={`toast${state.show ? ' show' : ''}`} role="status">
        <i style={{ background: state.bad ? 'var(--rose)' : 'var(--mint)' }}>{state.bad ? '!' : '✓'}</i>
        <span>{state.text}</span>
      </div>
    </ToastContext.Provider>
  );
}

/** Copy text and report the result in a toast. */
export function useCopy() {
  const toast = useToast();
  return useCallback(
    (text: string, message: string) => {
      const p = navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
      p.then(
        () => toast(message),
        () => toast('Copy blocked by the browser', true),
      );
    },
    [toast],
  );
}
