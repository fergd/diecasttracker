import type { ChangeEvent, FocusEvent } from 'react';
import { IonInput } from '@ionic/react';
import { Icon, type IconName } from './Icon';
import styles from './Input.module.css';

export type InputVariant = 'filled' | 'outlined';
export type InputMode = 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search';

export interface InputProps {
  variant?: InputVariant;
  label?: string;
  helperText?: string;
  error?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  value?: string;
  id?: string;
  inputMode?: InputMode;
  leadingIcon?: IconName;
  trailingIcon?: IconName;
  onTrailingIconClick?: () => void;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
  className?: string;
}

/** Text input field. Filled matches the detail-page edit fields, Outlined
 * matches the collection search field. Error shows a red border + message.
 * Wraps ion-input for a real mobile keyboard/focus experience, but keeps the
 * exact onChange/onBlur (native-input-shaped) API this had before - so
 * ItemDetail's ~20 field call sites don't need to change - by adapting
 * Ionic's onIonInput/onIonBlur CustomEvents internally. Uses onIonInput
 * (fires every keystroke) rather than onIonChange (fires on blur/commit) to
 * match a controlled native <input>'s onChange behavior. */
export function Input({
  variant = 'filled',
  label,
  helperText,
  error = false,
  disabled,
  leadingIcon,
  trailingIcon,
  onTrailingIconClick,
  className,
  id,
  value,
  placeholder,
  inputMode,
  readOnly,
  onChange,
  onBlur,
}: InputProps) {
  const inputId = id ?? `input-${label?.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className={[styles.wrapper, className].filter(Boolean).join(' ')}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
      )}
      <div
        className={[
          styles.field,
          styles[variant],
          error ? styles.error : '',
          disabled ? styles.disabled : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {leadingIcon && <Icon name={leadingIcon} size={18} className={styles.icon} />}
        <IonInput
          id={inputId}
          className={styles.input}
          value={value}
          placeholder={placeholder}
          inputmode={inputMode}
          disabled={disabled}
          readonly={readOnly}
          onIonInput={(e) => onChange?.({ target: { value: e.detail.value ?? '' } } as ChangeEvent<HTMLInputElement>)}
          onIonBlur={() => onBlur?.({} as FocusEvent<HTMLInputElement>)}
        />
        {trailingIcon && (
          <button
            type="button"
            className={styles.trailingIconButton}
            onClick={onTrailingIconClick}
            tabIndex={onTrailingIconClick ? 0 : -1}
            aria-hidden={!onTrailingIconClick}
          >
            <Icon name={trailingIcon} size={16} className={styles.icon} />
          </button>
        )}
      </div>
      {helperText && (
        <span className={[styles.helper, error ? styles.helperError : ''].filter(Boolean).join(' ')}>
          {helperText}
        </span>
      )}
    </div>
  );
}
