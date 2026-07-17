import { useRef, type ReactNode } from 'react';
import { IonModal } from '@ionic/react';
import styles from './Sheet.module.css';

export interface SheetProps {
  open: boolean;
  onClose?: () => void;
  dismissible?: boolean;
  children: ReactNode;
}

/** Bottom sheet: scanning progress, duplicate resolution, scan confirmation,
 * delete confirmation. `dismissible=false` (used while scanning) blocks
 * backdrop tap, swipe-to-dismiss, and the handle - the request in flight
 * can't be interrupted.
 *
 * Wraps ion-modal with breakpoints for the native drag-to-dismiss + handle
 * (replacing the hand-rolled .grabber div) instead of an instant show/hide.
 * Since ion-modal stays mounted and animates closed rather than
 * disappearing instantly, closing it usually clears the very state
 * (actionItem, lightbox, scanResult, etc.) its own children read to render
 * - without the snapshot below, the sheet would render blank while it
 * slides/fades away instead of showing its last content mid-exit. */
export function Sheet({ open, onClose, dismissible = true, children }: SheetProps) {
  const lastContent = useRef<ReactNode>(children);
  if (open) lastContent.current = children;

  return (
    <IonModal
      isOpen={open}
      onDidDismiss={onClose}
      backdropDismiss={dismissible}
      canDismiss={dismissible}
      breakpoints={[0, 1]}
      initialBreakpoint={1}
      handle={dismissible}
      className={styles.modal}
    >
      <div className={styles.sheet}>{open ? children : lastContent.current}</div>
    </IonModal>
  );
}
