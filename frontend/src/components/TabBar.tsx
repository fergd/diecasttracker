import type { ReactNode } from 'react';
import styles from './TabBar.module.css';

export interface TabBarProps {
  children: ReactNode;
  className?: string;
}

/** Rounded dark container hosting 2+ Tab instances (e.g. Carded / Loose). */
export function TabBar({ children, className }: TabBarProps) {
  return <div className={[styles.tabBar, className].filter(Boolean).join(' ')}>{children}</div>;
}
