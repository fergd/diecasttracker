import type { ReactNode } from 'react';
import { IonItem, IonThumbnail, IonLabel } from '@ionic/react';
import { Icon } from './Icon';
import { Badge } from './Badge';
import { useLongPress } from '../hooks/useLongPress';
import styles from './ListItemIonic.module.css';

export interface ListItemIonicProps {
  photoUrl?: string;
  title: string;
  meta: string;
  price?: string;
  statusLabel?: string;
  matchLabel?: string;
  matchVariant?: 'success' | 'warning' | 'error';
  showTreasureHunt?: boolean;
  showLot?: boolean;
  onClick?: () => void;
  onLongPress?: () => void;
  trailing?: ReactNode;
  selectable?: boolean;
  selected?: boolean;
}

/** Trial: same row as ListItem, built on ion-item/ion-thumbnail/ion-label
 * instead of hand-rolled divs, to evaluate Ionic's default touch-target
 * sizing and iOS-mode interaction feel. Kept side-by-side with ListItem
 * rather than replacing it. */
export function ListItemIonic({
  photoUrl,
  title,
  meta,
  price,
  statusLabel,
  matchLabel,
  matchVariant = 'success',
  showTreasureHunt = false,
  showLot = false,
  onClick,
  onLongPress,
  trailing,
  selectable = false,
  selected = false,
}: ListItemIonicProps) {
  const pressHandlers = useLongPress(onLongPress, onClick);
  return (
    <IonItem button={!!onClick} detail={false} lines="none" className={styles.item} {...pressHandlers}>
      {selectable && (
        <div className={[styles.checkbox, selected ? styles.checkboxChecked : ''].filter(Boolean).join(' ')} slot="start">
          {selected && <Icon name="tick02" size={14} />}
        </div>
      )}
      <IonThumbnail slot="start" className={styles.thumbnail}>
        {photoUrl ? (
          <img src={photoUrl} alt="" className={styles.photo} />
        ) : (
          <div className={styles.placeholder}>
            <Icon name="car05" size={24} />
          </div>
        )}
      </IonThumbnail>

      <IonLabel className={styles.label}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.meta}>{meta}</p>
        {(matchLabel || showTreasureHunt || showLot) && (
          <div className={styles.badges}>
            {matchLabel && <Badge variant={matchVariant}>{matchLabel}</Badge>}
            {showTreasureHunt && <Badge variant="warning">TH</Badge>}
            {showLot && <Badge variant="info">Lot</Badge>}
          </div>
        )}
      </IonLabel>

      {(price || statusLabel || trailing) && (
        <div slot="end" className={styles.trailing}>
          {price && <div className={styles.price}>{price}</div>}
          {statusLabel && <Badge variant="info">{statusLabel}</Badge>}
          {trailing}
        </div>
      )}
    </IonItem>
  );
}
