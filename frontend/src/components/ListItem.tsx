import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { Badge } from './Badge';
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
  onClick?: () => void;
  trailing?: ReactNode;
}

/** Row in the collection list: thumbnail (photo or colored placeholder),
 * title + metadata + status badges, trailing price + tracking status.
 * Plain divided row (bottom hairline), not an individually-bordered card. */
export function ListItem({
  photoUrl,
  title,
  meta,
  price,
  statusLabel,
  matchLabel,
  matchVariant = 'success',
  showTreasureHunt = false,
  onClick,
  trailing,
}: ListItemProps) {
  return (
    <div className={styles.listItem} onClick={onClick} role={onClick ? 'button' : undefined}>
      <div className={styles.thumbnail}>
        {photoUrl ? (
          <img src={photoUrl} alt="" className={styles.photo} />
        ) : (
          <div className={styles.placeholder}>
            <Icon name="car05" size={24} />
          </div>
        )}
      </div>

      <div className={styles.content}>
        <div className={styles.title}>{title}</div>
        <div className={styles.meta}>{meta}</div>
        {(matchLabel || showTreasureHunt) && (
          <div className={styles.badges}>
            {matchLabel && <Badge variant={matchVariant}>{matchLabel}</Badge>}
            {showTreasureHunt && <Badge variant="warning">TH</Badge>}
          </div>
        )}
      </div>

      {(price || statusLabel || trailing) && (
        <div className={styles.trailing}>
          {price && <div className={styles.price}>{price}</div>}
          {statusLabel && <Badge variant="info">{statusLabel}</Badge>}
          {trailing}
        </div>
      )}
    </div>
  );
}
