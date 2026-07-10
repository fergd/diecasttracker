import { useRef } from 'react';
import type { MouseEvent, TouchEvent } from 'react';

const LONG_PRESS_MS = 500;
const MOVE_CANCEL_PX = 10;

/** Combined press handlers for an element that needs both a tap (onClick)
 * and a long-press (onLongPress) - e.g. a list row that navigates on tap but
 * opens a quick-actions menu on hold. Cancels the pending long-press if the
 * pointer moves too far first (a scroll, not a hold), and swallows the click
 * that would otherwise fire right after a long-press fires. */
export function useLongPress(onLongPress: (() => void) | undefined, onClick: (() => void) | undefined) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const firedLongPress = useRef(false);

  function clearTimer() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    startPos.current = null;
  }

  function start(x: number, y: number) {
    firedLongPress.current = false;
    if (!onLongPress) return;
    startPos.current = { x, y };
    timer.current = setTimeout(() => {
      firedLongPress.current = true;
      onLongPress();
    }, LONG_PRESS_MS);
  }

  function checkMove(x: number, y: number) {
    if (!startPos.current) return;
    if (Math.hypot(x - startPos.current.x, y - startPos.current.y) > MOVE_CANCEL_PX) clearTimer();
  }

  function handleClick() {
    if (firedLongPress.current) {
      firedLongPress.current = false;
      return;
    }
    onClick?.();
  }

  return {
    onTouchStart: (e: TouchEvent) => start(e.touches[0].clientX, e.touches[0].clientY),
    onTouchMove: (e: TouchEvent) => checkMove(e.touches[0].clientX, e.touches[0].clientY),
    onTouchEnd: clearTimer,
    onMouseDown: (e: MouseEvent) => start(e.clientX, e.clientY),
    onMouseMove: (e: MouseEvent) => checkMove(e.clientX, e.clientY),
    onMouseUp: clearTimer,
    onMouseLeave: clearTimer,
    onClick: handleClick,
    onContextMenu: (e: MouseEvent) => e.preventDefault(),
  };
}
