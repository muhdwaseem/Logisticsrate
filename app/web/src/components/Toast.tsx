import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';

interface ToastState {
  text: string;
  isError: boolean;
  show: boolean;
  visible: boolean;
}

const ToastContext = createContext<(text: string, isError?: boolean) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToastState>({
    text: '',
    isError: false,
    show: false,
    visible: false,
  });
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const removeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const toast = useCallback((text: string, isError = false) => {
    clearTimeout(hideTimer.current);
    clearTimeout(removeTimer.current);
    setState({ text, isError, show: false, visible: true });
    requestAnimationFrame(() =>
      setState((s) => ({ ...s, show: true })),
    );
    hideTimer.current = setTimeout(() => {
      setState((s) => ({ ...s, show: false }));
      removeTimer.current = setTimeout(
        () => setState((s) => ({ ...s, visible: false })),
        220,
      );
    }, isError ? 5000 : 3000);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        className={`toast${state.show ? ' show' : ''}${state.isError ? ' err' : ''}`}
        hidden={!state.visible}
        role="status"
      >
        {state.text}
      </div>
    </ToastContext.Provider>
  );
}
