import { useEffect } from 'react';

const actionMenuSelector = 'details[data-action-menu]';

export function DismissibleActionMenus() {
  useEffect(() => {
    function closeOutsideMenus(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      document
        .querySelectorAll<HTMLDetailsElement>(`${actionMenuSelector}[open]`)
        .forEach((menu) => {
          if (!menu.contains(event.target as Node)) menu.open = false;
        });
    }

    function closeAfterAction(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      const action = event.target.closest('a, button');
      const menu = action?.closest<HTMLDetailsElement>(actionMenuSelector);
      if (menu) menu.open = false;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      const openMenus = [
        ...document.querySelectorAll<HTMLDetailsElement>(`${actionMenuSelector}[open]`),
      ];
      const lastMenu = openMenus.at(-1);
      openMenus.forEach((menu) => {
        menu.open = false;
      });
      lastMenu?.querySelector<HTMLElement>('summary')?.focus();
    }

    document.addEventListener('pointerdown', closeOutsideMenus, true);
    document.addEventListener('click', closeAfterAction, true);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutsideMenus, true);
      document.removeEventListener('click', closeAfterAction, true);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  return null;
}
