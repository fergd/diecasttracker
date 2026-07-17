import type { MouseEventHandler, ReactNode } from 'react';
import { IonButton } from '@ionic/react';
import { Icon, type IconName } from './Icon';
import styles from './Button.module.css';

export type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'text' | 'destructive';

const FILL: Record<ButtonVariant, 'solid' | 'outline' | 'clear'> = {
  filled: 'solid',
  tonal: 'solid',
  outlined: 'outline',
  text: 'clear',
  destructive: 'solid',
};

export interface ButtonProps {
  variant?: ButtonVariant;
  icon?: IconName;
  /** Spins the icon continuously - for a loading/in-progress state. */
  iconSpin?: boolean;
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLIonButtonElement>;
  className?: string;
  children?: ReactNode;
}

export function Button({ variant = 'filled', icon, iconSpin, disabled, onClick, className, children }: ButtonProps) {
  return (
    <IonButton
      fill={FILL[variant]}
      disabled={disabled}
      onClick={onClick}
      className={[styles.button, styles[variant], className].filter(Boolean).join(' ')}
    >
      {icon && (
        <Icon name={icon} size={18} className={[styles.icon, iconSpin ? styles.spin : ''].filter(Boolean).join(' ')} />
      )}
      <span>{children}</span>
    </IonButton>
  );
}
