import type { KeyboardEvent, ReactNode } from 'react';
import { IonChip } from '@ionic/react';
import { Icon } from './Icon';
import styles from './Tag.module.css';

export interface TagProps {
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  className?: string;
  children?: ReactNode;
}

/** Interactive filter/category tag. Default is outlined and neutral;
 * Selected fills with a tinted navy background. Optional removable X icon.
 * ion-chip's host isn't a native <button>, so the remove icon can be a real
 * nested <button> without the invalid-HTML/nested-interactive-control issue
 * a bare <button> wrapper would have had. */
export function Tag({ selected = false, disabled = false, onClick, onRemove, className, children }: TagProps) {
  function handleKeyDown(e: KeyboardEvent<HTMLIonChipElement>) {
    if (disabled || !onClick) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  }

  return (
    <IonChip
      className={[styles.tag, selected ? styles.selected : styles.default, disabled ? styles.disabled : '', className]
        .filter(Boolean)
        .join(' ')}
      onClick={disabled ? undefined : onClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-pressed={selected}
      aria-disabled={disabled}
    >
      <span>{children}</span>
      {onRemove && (
        <button
          type="button"
          className={styles.removeIcon}
          aria-label="Remove"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <Icon name="cancel01" size={14} />
        </button>
      )}
    </IonChip>
  );
}
