import { useEffect } from 'react';
import { Icon } from './Icon';
import styles from './Toast.module.css';

export interface ToastProps {
  message: string;
  variant: 'success' | 'error';
  onDismiss: () => void;
  durationMs?: number;
}

/** Floating auto-dismissing notification, fixed to the top of the screen. */
export function Toast({ message, variant, onDismiss, durationMs = 3000 }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [onDismiss, durationMs]);

  return (
    <div className={[styles.toast, styles[variant]].join(' ')} role="status">
      <Icon name={variant === 'success' ? 'tick02' : 'cancel01'} size={18} />
      <span>{message}</span>
    </div>
  );
}
