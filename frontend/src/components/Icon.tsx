import { ICON_PATHS, type IconName } from './icon-paths';

export type { IconName };

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  /** Fills the shape with currentColor instead of just stroking it - for
   * icons with an on/off state (e.g. a favorited heart) where the filled
   * look is the whole point of the toggle. */
  filled?: boolean;
}

/**
 * Stroke-only icon (Hugeicons free "stroke-rounded" style, 1.5 weight).
 * Never filled by default - color is set via `currentColor`, so it inherits
 * from whatever text color is in scope wherever the icon is used.
 */
export function Icon({ name, size = 20, className, filled = false }: IconProps) {
  const paths = ICON_PATHS[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill={filled ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
