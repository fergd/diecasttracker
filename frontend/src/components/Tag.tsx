import type { ButtonHTMLAttributes } from 'react';
import { Icon } from './Icon';
import styles from './Tag.module.css';

export interface TagProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  onRemove?: () => void;
}

/** Interactive filter/category tag. Default is outlined and neutral;
 * Selected fills with a tinted navy background. Optional removable X icon. */
export function Tag({ selected = false, disabled, onRemove, className, children, ...rest }: TagProps) {
  return (
    <button
      className={[styles.tag, selected ? styles.selected : styles.default, className]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled}
      aria-pressed={selected}
      {...rest}
    >
      <span>{children}</span>
      {onRemove && (
        <span
          className={styles.removeIcon}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <Icon name="cancel01" size={14} />
        </span>
      )}
    </button>
  );
}
