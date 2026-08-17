import { useEffect } from 'react';
import { useMenuFocus } from './keyboard-accessibility';

interface GameContextMenuProps {
  gameTitle: string;
  position: { x: number; y: number };
  onProperties(): void;
  onUninstall(): void;
  // Absent when there is nothing installed to redo or nothing to link.
  onReinstall?(): void;
  onSetUpRom?(): void;
  onClose(): void;
  returnFocusTo?: HTMLElement | null;
}

// Steam-style right-click menu for a library game: a real role=menu whose
// menuitems take focus on open; Escape or any click outside dismisses it.
export function GameContextMenu({
  gameTitle,
  position,
  onProperties,
  onUninstall,
  onReinstall,
  onSetUpRom,
  onClose,
  returnFocusTo,
}: GameContextMenuProps) {
  const { closeAndRestore, menuRef, onMenuKeyDown } = useMenuFocus<HTMLDivElement>(
    true,
    onClose,
    { returnFocusTo },
  );

  useEffect(() => {
    const menu = menuRef.current;
    function onPointerDown(event: MouseEvent) {
      if (menu && !menu.contains(event.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [onClose]);

  // Keep the menu on screen when the cursor is near an edge.
  const style = {
    left: Math.max(4, Math.min(position.x, window.innerWidth - 190)),
    top: Math.max(4, Math.min(position.y, window.innerHeight - 90)),
  };

  return (
    <div
      aria-label={`${gameTitle} actions`}
      className="context-menu"
      ref={menuRef}
      role="menu"
      style={style}
      onKeyDown={onMenuKeyDown}
    >
      <button
        role="menuitem"
        type="button"
        onClick={() => {
          closeAndRestore();
          onProperties();
        }}
      >
        Properties…
      </button>
      {onReinstall ? (
        <button
          role="menuitem"
          type="button"
          onClick={() => {
            closeAndRestore();
            onReinstall();
          }}
        >
          Reinstall
        </button>
      ) : null}
      {onSetUpRom ? (
        <button
          role="menuitem"
          type="button"
          onClick={() => {
            closeAndRestore();
            onSetUpRom();
          }}
        >
          Link original copy…
        </button>
      ) : null}
      <button
        role="menuitem"
        type="button"
        onClick={() => {
          closeAndRestore();
          onUninstall();
        }}
      >
        Uninstall
      </button>
    </div>
  );
}
