import { useCallback, useEffect, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableElements(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true',
  );
}

interface ModalFocusOptions {
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusTo?: HTMLElement | null;
}

// Implements the WAI-ARIA modal keyboard contract in one place so every
// overlay takes focus, contains Tab/Shift+Tab, closes on Escape, and restores
// the control that launched it.
export function useModalFocus<T extends HTMLElement>(
  open: boolean,
  onClose: () => void,
  options: ModalFocusOptions = {},
) {
  const dialogRef = useRef<T>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener =
      options.returnFocusTo ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);

    (options.initialFocusRef?.current ?? focusableElements(dialog)[0] ?? dialog).focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusableElements(dialog as HTMLElement);
      if (items.length === 0) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog?.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (opener?.isConnected) opener.focus();
    };
  }, [open, options.initialFocusRef, options.returnFocusTo]);

  return dialogRef;
}

interface MenuFocusOptions {
  returnFocusTo?: HTMLElement | null;
}

// Menu buttons use arrows/Home/End inside the popup. Escape and completed
// menu actions restore the launcher; pointer clicks outside retain their own
// natural focus destination.
export function useMenuFocus<T extends HTMLElement>(
  open: boolean,
  onClose: () => void,
  options: MenuFocusOptions = {},
) {
  const menuRef = useRef<T>(null);
  const closeRef = useRef(onClose);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  closeRef.current = onClose;
  returnFocusRef.current = options.returnFocusTo ?? returnFocusRef.current;

  const closeAndRestore = useCallback(() => {
    closeRef.current();
    const opener = returnFocusRef.current;
    if (opener?.isConnected) opener.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    menu?.querySelector<HTMLElement>('[role="menuitem"], a[href]')?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closeAndRestore();
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, closeAndRestore]);

  function onMenuKeyDown(event: ReactKeyboardEvent) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = [
      ...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"], a[href]') ?? []),
    ].filter((item) => item.getAttribute('aria-disabled') !== 'true');
    if (items.length === 0) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Home') items[0].focus();
    else if (event.key === 'End') items[items.length - 1].focus();
    else if (event.key === 'ArrowDown') items[(current + 1) % items.length].focus();
    else items[(current - 1 + items.length) % items.length].focus();
  }

  return { closeAndRestore, menuRef, onMenuKeyDown };
}
