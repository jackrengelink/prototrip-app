import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { useT } from '../state/prefs';
import { Button, Modal } from './ui';

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

interface FeedbackValue {
  toast(message: string, tone?: ToastTone): void;
  confirm(opts: ConfirmOptions): Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve(v: boolean): void }) | null>(null);
  const counter = useRef(0);

  const toast = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = ++counter.current;
    setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3200);
  }, []);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setConfirmState({ ...opts, resolve });
      }),
    [],
  );

  const close = (value: boolean) => {
    confirmState?.resolve(value);
    setConfirmState(null);
  };

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((x) => (
          <div key={x.id} className={`toast toast-${x.tone}`}>
            {x.tone === 'success' ? <CheckCircle2 size={18} /> : x.tone === 'error' ? <AlertTriangle size={18} /> : <Info size={18} />}
            <span>{x.message}</span>
          </div>
        ))}
      </div>
      <Modal
        open={!!confirmState}
        onClose={() => close(false)}
        title={confirmState?.title}
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant={confirmState?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
              {confirmState?.confirmLabel ?? 'OK'}
            </Button>
          </>
        }
      >
        {confirmState?.message && <div className="confirm-message">{confirmState.message}</div>}
      </Modal>
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback outside FeedbackProvider');
  return ctx;
}
