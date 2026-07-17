import type { ReactNode } from 'react';
import { IonItem, IonThumbnail, IonLabel } from '@ionic/react';
import { Icon } from './Icon';
import { Badge } from './Badge';
import { useLongPress } from '../hooks/useLongPress';
import styles from './ListItem.module.css';

export interface ListItemProps {
  photoUrl?: string;
  title: string;
  meta: string;
  price?: string;
  statusLabel?: string;
  matchLabel?: string;
  matchVariant?: 'success' | 'warning' | 'error';
  showTreasureHunt?: boolean;
  /** Part of a combined eBay lot listing (shares a lot_id with other rows). */
  showLot?: boolean;
  onClick?: () => void;
  /** Holding the row (touch or mouse) opens a quick-actions menu instead of
   * navigating - suppresses the click that would otherwise follow. */
  onLongPress?: () => void;
  trailing?: ReactNode;
  /** Batch-selection mode (e.g. bulk rematch) - shows a checkbox instead of
   * navigating on tap. `onClick` still fires and should toggle selection. */
  selectable?: boolean;
  selected?: boolean;
}

/** Row in the collection list: thumbnail (photo or colored placeholder),
 * title + metadata + status badges, trailing price + tracking status.
 * Built on ion-item/ion-thumbnail/ion-label rather than hand-rolled divs -
 * the 56px thumbnail already forced a tall-enough row, but ion-item adds
 * real press feedback (the old plain <div> had none). */
export function ListItem({
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
}: ListItemProps) {
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
