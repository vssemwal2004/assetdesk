import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DismissibleActionMenus } from './dismissible-action-menus';

function ActionMenuFixture() {
  return (
    <>
      <DismissibleActionMenus />
      <details data-action-menu onClick={(event) => event.stopPropagation()} open>
        <summary>Row actions</summary>
        <button type="button">View details</button>
      </details>
      <button type="button">Another control</button>
    </>
  );
}

describe('DismissibleActionMenus', () => {
  it('closes an open menu when another control is pressed', () => {
    render(<ActionMenuFixture />);
    const menu = screen.getByText('Row actions').closest('details');

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Another control' }));

    expect(menu).not.toHaveAttribute('open');
  });

  it('closes after a menu action and supports Escape', () => {
    render(<ActionMenuFixture />);
    const summary = screen.getByText('Row actions');
    const menu = summary.closest('details') as HTMLDetailsElement;

    fireEvent.click(screen.getByRole('button', { name: 'View details' }));
    expect(menu).not.toHaveAttribute('open');

    menu.open = true;
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(menu).not.toHaveAttribute('open');
    expect(summary).toHaveFocus();
  });
});
