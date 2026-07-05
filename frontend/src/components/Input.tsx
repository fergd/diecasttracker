import { forwardRef, type InputHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';
import styles from './Input.module.css';

export type InputVariant = 'filled' | 'outlined';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: InputVariant;
  label?: string;
  helperText?: string;
  error?: boolean;
  leadingIcon?: IconName;
  trailingIcon?: IconName;
  onTrailingIconClick?: () => void;
}

/** Text input field. Filled matches the detail-page edit fields, Outlined
 * matches the collection search field. Error shows a red border + message. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
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
    ...rest
  },
  ref,
) {
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
        <input id={inputId} ref={ref} disabled={disabled} className={styles.input} {...rest} />
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
});
