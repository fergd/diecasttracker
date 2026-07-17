import { IonButton } from '@ionic/react';
import { Icon, type IconName } from './Icon';
import styles from './IconButtonIonic.module.css';

export interface IconButtonIonicProps {
  icon: IconName;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}

/** Trial: round icon-only button built on ion-button instead of a bare
 * <button>, sized to a real 44px tap target (the bare-<button> versions in
 * this app render at 28-36px - see CollectionList's old .sortButton /
 * .selectionIconButton). Compare press feedback against those directly. */
export function IconButtonIonic({ icon, label, onClick, disabled }: IconButtonIonicProps) {
  return (
    <IonButton
      fill="clear"
      className={styles.button}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      <Icon name={icon} size={18} />
    </IonButton>
  );
}
