import type { ReactNode } from 'react';
import { IonSegment, IonSegmentButton, IonLabel } from '@ionic/react';
import styles from './Segment.module.css';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
}

export interface SegmentProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  className?: string;
}

/** Replaces TabBar+Tab: a controlled segmented control (packaging type,
 * treasure-hunt, tracking status) instead of N independently-clicked Tab
 * buttons. ion-segment in iOS mode already renders the sliding-pill look
 * Tab/TabBar were hand-rolling, and its buttons default to a real 44px+
 * tap target instead of the ~37px Tab computed to. */
export function Segment<T extends string>({ value, onChange, options, className }: SegmentProps<T>) {
  return (
    <IonSegment
      value={value}
      className={[styles.segment, className].filter(Boolean).join(' ')}
      onIonChange={(e) => {
        const next = e.detail.value;
        if (next != null) onChange(next as T);
      }}
    >
      {options.map((opt) => (
        <IonSegmentButton key={opt.value} value={opt.value} className={styles.button}>
          <IonLabel>{opt.label}</IonLabel>
        </IonSegmentButton>
      ))}
    </IonSegment>
  );
}
