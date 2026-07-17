import type { HTMLAttributes } from 'react';
import { IonBadge } from '@ionic/react';
import styles from './Badge.module.css';

export type BadgeStyle = 'success' | 'warning' | 'error' | 'info' | 'ai' | 'neutral';

export interface BadgeProps extends HTMLAttributes<HTMLElement> {
  variant?: BadgeStyle;
}

/** Small, non-interactive status indicator (match confidence, treasure hunt,
 * tracking status). Tinted background at 13% opacity of the semantic color. */
export function Badge({ variant = 'neutral', className, children, ...rest }: BadgeProps) {
  return (
    <IonBadge className={[styles.badge, styles[variant], className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </IonBadge>
  );
}
