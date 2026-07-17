import { IonButton } from '@ionic/react';
import { Icon, type IconName } from './Icon';
import styles from './IconButtonIonic.module.css';

export interface IconButtonIonicProps {
  icon: IconName;
  label: string;
  iconSize?: number;
  /** Passed through to Icon's `filled` prop - for icons with an on/off state
   * (e.g. a favorited heart). */
  iconFilled?: boolean;
  /** 'default' is a real 44px tap target. 'sm' (36px) is only for spots too
   * tight for that - e.g. an overlay on a small photo thumbnail - and is
   * still bigger than the 28-36px bare-<button> versions it replaces. */
  size?: 'default' | 'sm';
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

/** Round icon-only button built on ion-button, replacing this app's bare
 * <button className="...IconButton"> pattern (which rendered at 28-40px,
 * under the 44pt/48dp touch-target minimum). */
export function IconButtonIonic({
  icon,
  label,
  iconSize = 18,
  iconFilled = false,
  size = 'default',
  onClick,
  disabled,
  className,
}: IconButtonIonicProps) {
  return (
    <IonButton
      fill="clear"
      className={[styles.button, size === 'sm' ? styles.sm : '', className].filter(Boolean).join(' ')}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      <Icon name={icon} size={iconSize} filled={iconFilled} />
    </IonButton>
  );
}
