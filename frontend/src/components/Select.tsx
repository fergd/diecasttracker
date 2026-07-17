import type { ChangeEvent } from 'react';
import { IonSelect, IonSelectOption } from '@ionic/react';
import styles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label?: string;
  options: SelectOption[];
  value?: string;
  id?: string;
  className?: string;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
}

/** Native select styled to match Input's filled variant - used for Brand
 * and other short fixed-choice fields. Wraps ion-select with an
 * action-sheet interface for a native-feeling full-screen picker instead
 * of a cramped inline dropdown, but keeps the same value/onChange
 * (native-select-shaped) API as before. */
export function Select({ label, options, id, className, value, onChange }: SelectProps) {
  const selectId = id ?? `select-${label?.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className={[styles.wrapper, className].filter(Boolean).join(' ')}>
      {label && (
        <label htmlFor={selectId} className={styles.label}>
          {label}
        </label>
      )}
      <IonSelect
        id={selectId}
        className={styles.select}
        interface="action-sheet"
        interfaceOptions={label ? { header: label } : undefined}
        value={value}
        onIonChange={(e) => onChange?.({ target: { value: e.detail.value ?? '' } } as ChangeEvent<HTMLSelectElement>)}
      >
        {options.map((opt) => (
          <IonSelectOption key={opt.value} value={opt.value}>
            {opt.label}
          </IonSelectOption>
        ))}
      </IonSelect>
    </div>
  );
}
