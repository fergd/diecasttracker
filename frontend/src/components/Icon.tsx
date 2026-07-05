import { ICON_PATHS, type IconName } from './icon-paths';

export type { IconName };

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

/**
 * Stroke-only icon (Hugeicons free "stroke-rounded" style, 1.5 weight).
 * Never filled - color is set via `currentColor`, so it inherits from
 * whatever text color is in scope wherever the icon is used.
 */
export function Icon({ name, size = 20, className }: IconProps) {
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
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
