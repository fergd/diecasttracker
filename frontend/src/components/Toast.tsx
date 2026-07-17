import { IonToast } from '@ionic/react';
import { ICON_PATHS } from './icon-paths';
import styles from './Toast.module.css';

export interface ToastProps {
  message: string;
  variant: 'success' | 'error';
  onDismiss: () => void;
  durationMs?: number;
}

/** ion-toast's `icon` prop takes an ionicon name or image URL, not a React
 * node - it can't host our own <Icon> component directly. Builds a small
 * inline data-URI SVG from the same stroke path data instead, so the
 * success/error glyph still matches the rest of the app's icon set. Color
 * is hardcoded (not currentColor) since a data-URI image sits outside the
 * page's CSS cascade. */
function iconDataUri(paths: readonly string[]): string {
  const strokes = paths
    .map(
      (d) =>
        `<path d="${d}" stroke="#f7f8f9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">${strokes}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const VARIANT_ICON = {
  success: iconDataUri(ICON_PATHS.tick02),
  error: iconDataUri(ICON_PATHS.cancel01),
};

/** Floating auto-dismissing notification, fixed to the top of the screen.
 * Also picks up ion-toast's swipe-to-dismiss for free - the old version had
 * no way to dismiss early besides waiting out the timeout. */
export function Toast({ message, variant, onDismiss, durationMs = 3000 }: ToastProps) {
  return (
    <IonToast
      isOpen
      message={message}
      icon={VARIANT_ICON[variant]}
      duration={durationMs}
      position="top"
      swipeGesture="vertical"
      onDidDismiss={onDismiss}
      className={[styles.toast, styles[variant]].join(' ')}
    />
  );
}
