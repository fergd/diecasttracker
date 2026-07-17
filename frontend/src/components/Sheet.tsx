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
 * slides/fades away instead of showing its last content mid-exit.
 *
 * canDismiss is a function, not just `dismissible`, on purpose: IonModal's
 * dismiss() checks it for EVERY dismissal, including our own `isOpen={false}`
 * (role is undefined there) - a literal `false` blocks that too, not just
 * user-initiated swipe/backdrop attempts (role 'gesture'/'backdrop'). When
 * it blocks, IonModal aborts before the step that clears the body-level
 * scroll lock it applies while open, and that overlay is stuck reporting
 * itself as still "presented" for the rest of the page's life - poisoning
 * every OTHER sheet's dismiss check afterward too, since Ionic only releases
 * the lock once zero overlays claim to be presented. Gate only the
 * user-initiated roles on `dismissible`; always allow our own. */
export function Sheet({ open, onClose, dismissible = true, children }: SheetProps) {
  const lastContent = useRef<ReactNode>(children);
  if (open) lastContent.current = children;

  return (
    <IonModal
      isOpen={open}
      onDidDismiss={onClose}
      backdropDismiss={dismissible}
      canDismiss={async (_data, role) => dismissible || role === undefined}
      breakpoints={[0, 1]}
      initialBreakpoint={1}
      handle={dismissible}
      className={styles.modal}
    >
      <div className={styles.sheet}>{open ? children : lastContent.current}</div>
    </IonModal>
  );
}
