import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import type { WorkerDataAccess, WorkerPermission } from '@assetdesk/contracts';

import { AccessEditor } from './permission-matrix';

function AccessEditorHarness({
  initialPermissions = ['DASHBOARD'],
  initialDataAccess = { inventory: 'OWN', issues: 'OWN', cartridges: 'OWN' },
}: {
  initialPermissions?: WorkerPermission[];
  initialDataAccess?: WorkerDataAccess;
}) {
  const [permissions, setPermissions] = useState(initialPermissions);
  const [dataAccess, setDataAccess] = useState(initialDataAccess);

  return (
    <>
      <AccessEditor
        dataAccess={dataAccess}
        onDataAccessChange={setDataAccess}
        onPermissionsChange={setPermissions}
        selected={permissions}
      />
      <output data-testid="permissions">{JSON.stringify(permissions)}</output>
      <output data-testid="data-access">{JSON.stringify(dataAccess)}</output>
    </>
  );
}

describe('AccessEditor', () => {
  it('organizes permissions by area and keeps data visibility with its area', () => {
    render(<AccessEditorHarness initialPermissions={['DASHBOARD', 'INVENTORY_VIEW']} />);

    expect(screen.getByRole('checkbox', { name: /Open dashboard/i })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Add inventory material/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Inventory/i }));

    expect(screen.getByRole('checkbox', { name: /Add inventory material/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Whole data/i }));

    expect(screen.getByTestId('data-access')).toHaveTextContent('"inventory":"ALL"');
  });

  it('shows a partial state and can enable an entire area', () => {
    render(<AccessEditorHarness initialPermissions={['DASHBOARD', 'ISSUES_VIEW']} />);

    fireEvent.click(screen.getByRole('button', { name: /Issues/i }));
    const groupToggle = screen.getByRole('checkbox', {
      name: 'Enable all Issues permissions',
    }) as HTMLInputElement;

    expect(groupToggle.indeterminate).toBe(true);
    fireEvent.click(groupToggle);

    expect(screen.getByTestId('permissions')).toHaveTextContent('"ASSIGNMENTS_CREATE"');
    expect(screen.getByTestId('permissions')).toHaveTextContent('"RETURN_DATES_EXTEND"');
  });

  it('preserves hidden legacy permissions while visible permissions are edited', () => {
    render(<AccessEditorHarness initialPermissions={['INVENTORY_MANAGE', 'DASHBOARD']} />);

    fireEvent.click(screen.getByRole('checkbox', { name: /Open dashboard/i }));

    expect(screen.getByTestId('permissions')).toHaveTextContent('["INVENTORY_MANAGE"]');
  });
});
