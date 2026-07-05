import type { ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';
import styles from './Tab.module.css';

export interface TabProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  icon?: IconName;
}

/** A single segment within a TabBar (e.g. Carded / Loose). Button-shaped,
 * not underline-indicated - Selected fills with navy + gold text. */
export function Tab({ selected = false, disabled, icon, className, children, ...rest }: TabProps) {
  return (
    <button
      className={[styles.tab, selected ? styles.selected : styles.notSelected, className]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled}
      aria-pressed={selected}
      {...rest}
    >
      {icon && <Icon name={icon} size={18} />}
      <span>{children}</span>
    </button>
  );
}
