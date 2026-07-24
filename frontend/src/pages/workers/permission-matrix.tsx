import { DEFAULT_WORKER_PERMISSIONS, type WorkerPermission } from '@assetdesk/contracts';

import { Button, cn } from '../../components/ui';

interface PermissionDefinition {
  permission: WorkerPermission;
  group: string;
  label: string;
  description: string;
}

export const permissionDefinitions: PermissionDefinition[] = [
  {
    permission: 'DASHBOARD',
    group: 'Dashboard',
    label: 'Open dashboard',
    description: 'View assigned overview and operational summary.',
  },
  {
    permission: 'ISSUES_VIEW',
    group: 'Issues',
    label: 'View issue records',
    description: 'Search and open issue history.',
  },
  {
    permission: 'ASSIGNMENTS_CREATE',
    group: 'Issues',
    label: 'Create issue material',
    description: 'Open Add Issue and issue material to receivers.',
  },
  {
    permission: 'ISSUES_EDIT',
    group: 'Issues',
    label: 'Edit issue records',
    description: 'Use Edit Issue from issue details or the issue action menu.',
  },
  {
    permission: 'ISSUES_DELETE',
    group: 'Issues',
    label: 'Delete issue records',
    description: 'Use Delete Issue from the issue action menu.',
  },
  {
    permission: 'ISSUE_SLIPS_VIEW',
    group: 'Issues',
    label: 'Open issue/return slips',
    description: 'Generate and print Issue/Return Slip from issue actions.',
  },
  {
    permission: 'RETURN_DATES_EXTEND',
    group: 'Issues',
    label: 'Extend return date',
    description: 'Use Extend return date for short-term issued material.',
  },
  {
    permission: 'RETURNS_VIEW',
    group: 'Returns',
    label: 'View return records',
    description: 'Search return history and open return events.',
  },
  {
    permission: 'RETURNS_RECORD',
    group: 'Returns',
    label: 'Record returns',
    description: 'Use Record Return from issue actions and return workflows.',
  },
  {
    permission: 'INVENTORY_VIEW',
    group: 'Inventory',
    label: 'View inventory data',
    description: 'Search inventory, stock, and asset units.',
  },
  {
    permission: 'INVENTORY_MANAGE',
    group: 'Inventory',
    label: 'Add/edit inventory material',
    description: 'Add material, edit material, archive/delete material, and adjust quantity.',
  },
  {
    permission: 'ASSET_TYPES_MANAGE',
    group: 'Inventory',
    label: 'Manage asset types',
    description: 'Add, bulk upload, and delete asset type dropdown values.',
  },
  {
    permission: 'INVENTORY_IMPORT',
    group: 'Inventory',
    label: 'Bulk upload inventory',
    description: 'Validate, review, and upload CSV/XLSX inventory data.',
  },
  {
    permission: 'INVENTORY_EXPORT',
    group: 'Inventory',
    label: 'Download inventory data',
    description: 'Export inventory data according to filters.',
  },
  {
    permission: 'ASSET_UNITS_MANAGE',
    group: 'Inventory',
    label: 'Manage asset units',
    description: 'Add, edit, delete, and update serialized asset units.',
  },
  {
    permission: 'RECEIVERS_VIEW',
    group: 'Receivers',
    label: 'View receivers',
    description: 'Search and open receiver records.',
  },
  {
    permission: 'RECEIVERS_MANAGE',
    group: 'Receivers',
    label: 'Manage receivers',
    description: 'Add and edit receiver records.',
  },
  {
    permission: 'REPORTS_VIEW',
    group: 'Reports',
    label: 'View reports',
    description: 'Open reports and export operational data.',
  },
];

export const permissionLabels = Object.fromEntries(
  permissionDefinitions.map((definition) => [definition.permission, definition.label]),
) as Record<WorkerPermission, string>;

const groupedPermissions = permissionDefinitions.reduce<Record<string, PermissionDefinition[]>>(
  (groups, definition) => {
    (groups[definition.group] ??= []).push(definition);
    return groups;
  },
  {},
);

function unique(values: WorkerPermission[]): WorkerPermission[] {
  return DEFAULT_WORKER_PERMISSIONS.filter((permission) => values.includes(permission));
}

export function PermissionMatrix({
  selected,
  onChange,
  readonly = false,
}: {
  selected: WorkerPermission[];
  onChange?: (permissions: WorkerPermission[]) => void;
  readonly?: boolean;
}) {
  function setPermission(permission: WorkerPermission, enabled: boolean) {
    if (!onChange) return;
    const next = enabled
      ? unique([...selected, permission])
      : selected.filter((item) => item !== permission);
    onChange(next);
  }

  function setGroup(permissions: WorkerPermission[], enabled: boolean) {
    if (!onChange) return;
    const next = enabled
      ? unique([...selected, ...permissions])
      : selected.filter((item) => !permissions.includes(item));
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {!readonly ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={() => onChange?.([...DEFAULT_WORKER_PERMISSIONS])} type="button" variant="secondary">
            Select all
          </Button>
          <Button onClick={() => onChange?.(['DASHBOARD'])} type="button" variant="secondary">
            Minimal
          </Button>
        </div>
      ) : null}
      <div className="grid gap-3 xl:grid-cols-2">
        {Object.entries(groupedPermissions).map(([group, definitions]) => {
          const groupPermissions = definitions.map((definition) => definition.permission);
          const checkedCount = groupPermissions.filter((permission) =>
            selected.includes(permission),
          ).length;
          const allChecked = checkedCount === groupPermissions.length;
          return (
            <section
              className="rounded-[10px] border border-[var(--color-border)] bg-white p-3"
              key={group}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-extrabold text-[var(--color-primary-strong)]">
                    {group}
                  </h3>
                  <p className="mt-0.5 text-xs font-semibold text-[var(--color-text-muted)]">
                    {checkedCount} of {groupPermissions.length} enabled
                  </p>
                </div>
                {!readonly ? (
                  <label className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-muted)]">
                    All
                    <input
                      checked={allChecked}
                      className="size-4 accent-[var(--color-primary)]"
                      onChange={(event) => setGroup(groupPermissions, event.target.checked)}
                      type="checkbox"
                    />
                  </label>
                ) : null}
              </div>
              <div className="mt-3 grid gap-2">
                {definitions.map((definition) => {
                  const enabled = selected.includes(definition.permission);
                  return (
                    <label
                      className={cn(
                        'grid gap-1 rounded-[8px] border px-3 py-2 text-sm transition-colors',
                        enabled
                          ? 'border-[var(--color-primary-border)] bg-[var(--color-primary-soft)]'
                          : 'border-[var(--color-border)] bg-white',
                        readonly ? 'cursor-default' : 'cursor-pointer hover:border-[var(--color-primary)]',
                      )}
                      key={definition.permission}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="font-bold text-[var(--color-text-strong)]">
                          {definition.label}
                        </span>
                        <input
                          checked={enabled}
                          className="mt-0.5 size-4 accent-[var(--color-primary)]"
                          disabled={readonly}
                          onChange={(event) =>
                            setPermission(definition.permission, event.target.checked)
                          }
                          type="checkbox"
                        />
                      </span>
                      <span className="text-xs leading-5 text-[var(--color-text-muted)]">
                        {definition.description}
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
