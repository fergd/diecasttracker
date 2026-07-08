import type { ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';
import styles from './Button.module.css';

export type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'text' | 'destructive';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: IconName;
  /** Spins the icon continuously - for a loading/in-progress state. */
  iconSpin?: boolean;
}

export function Button({ variant = 'filled', icon, iconSpin, disabled, className, children, ...rest }: ButtonProps) {
  return (
    <button
      className={[styles.button, styles[variant], className].filter(Boolean).join(' ')}
      disabled={disabled}
      {...rest}
    >
      {icon && <Icon name={icon} size={18} className={iconSpin ? styles.spin : undefined} />}
      <span>{children}</span>
    </button>
  );
}
