import type { HTMLAttributes } from 'react';
import styles from './Badge.module.css';

export type BadgeStyle = 'success' | 'warning' | 'error' | 'info' | 'ai' | 'neutral';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeStyle;
}

/** Small, non-interactive status indicator (match confidence, treasure hunt,
 * tracking status). Tinted background at 13% opacity of the semantic color. */
export function Badge({ variant = 'neutral', className, children, ...rest }: BadgeProps) {
  return (
    <span className={[styles.badge, styles[variant], className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </span>
  );
}
