import type { SelectHTMLAttributes } from 'react';
import styles from './Select.module.css';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

/** Native select styled to match Input's filled variant - used for Brand
 * and other short fixed-choice fields. */
export function Select({ label, options, id, className, ...rest }: SelectProps) {
  const selectId = id ?? `select-${label?.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className={[styles.wrapper, className].filter(Boolean).join(' ')}>
      {label && (
        <label htmlFor={selectId} className={styles.label}>
          {label}
        </label>
      )}
      <select id={selectId} className={styles.select} {...rest}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
