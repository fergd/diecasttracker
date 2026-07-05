import type { ReactNode } from 'react';
import styles from './Sheet.module.css';

export interface SheetProps {
  open: boolean;
  onClose?: () => void;
  dismissible?: boolean;
  children: ReactNode;
}

/** Bottom sheet: scanning progress, duplicate resolution, scan confirmation,
 * delete confirmation. `dismissible=false` (used while scanning) hides the
 * backdrop-tap-to-close behavior so it can't be dismissed mid-request. */
export function Sheet({ open, onClose, dismissible = true, children }: SheetProps) {
  if (!open) return null;
  return (
    <div className={styles.backdrop} onClick={dismissible ? onClose : undefined}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.grabber} />
        {children}
      </div>
    </div>
  );
}
