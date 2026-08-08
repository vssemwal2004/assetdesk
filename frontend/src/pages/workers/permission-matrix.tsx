import {
  BarChart3,
  Boxes,
  ChevronRight,
  ClipboardList,
  ContactRound,
  LayoutDashboard,
  Printer,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { WorkerDataAccess, WorkerDataScope, WorkerPermission } from '@assetdesk/contracts';

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
    label: 'Open issue/return receipts',
    description: 'Generate and print Issue/Return Receipt from issue actions.',
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
    permission: 'INVENTORY_ADD',
    group: 'Inventory',
    label: 'Add inventory material',
    description: 'Add new IT Assets and IT Consumables individually.',
  },
  {
    permission: 'INVENTORY_EDIT',
    group: 'Inventory',
    label: 'Edit inventory material',
    description: 'Edit material details and inventory status.',
  },
  {
    permission: 'INVENTORY_DELETE',
    group: 'Inventory',
    label: 'Delete inventory material',
    description: 'Delete inventory material when no issue history blocks it.',
  },
  {
    permission: 'INVENTORY_QUANTITY_ADJUST',
    group: 'Inventory',
    label: 'Adjust inventory quantity',
    description: 'Increase or reduce quantity-tracked consumable stock.',
  },
  {
    permission: 'INVENTORY_MODELS_ADD',
    group: 'Inventory',
    label: 'Add inventory models',
    description: 'View category models and register official model names in Model Master.',
  },
  {
    permission: 'INVENTORY_MODELS_MERGE',
    group: 'Inventory',
    label: 'Merge inventory models',
    description: 'Merge duplicate model names inside an inventory category.',
  },
  {
    permission: 'ASSET_TYPES_ADD',
    group: 'Inventory',
    label: 'Add asset types',
    description: 'Add asset type dropdown values individually or by bulk upload.',
  },
  {
    permission: 'ASSET_TYPES_DELETE',
    group: 'Inventory',
    label: 'Delete asset types',
    description: 'Delete unused asset type dropdown values.',
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
    permission: 'ASSET_UNITS_ADD',
    group: 'Inventory',
    label: 'Add asset units',
    description: 'Add serialized IT Asset units to existing material.',
  },
  {
    permission: 'ASSET_UNITS_EDIT',
    group: 'Inventory',
    label: 'Edit asset units',
    description: 'Edit serial number, condition, and manual status of asset units.',
  },
  {
    permission: 'ASSET_UNITS_DELETE',
    group: 'Inventory',
    label: 'Delete asset units',
    description: 'Delete available asset units with no issue history.',
  },
  {
    permission: 'RECEIVERS_VIEW',
    group: 'Receivers',
    label: 'View receivers',
    description: 'Search and open receiver records.',
  },
  {
    permission: 'RECEIVERS_ADD',
    group: 'Receivers',
    label: 'Add receivers',
    description: 'Create new receiver records.',
  },
  {
    permission: 'RECEIVERS_EDIT',
    group: 'Receivers',
    label: 'Edit receivers',
    description: 'Edit receiver details and active status.',
  },
  {
    permission: 'RECEIVERS_DELETE',
    group: 'Receivers',
    label: 'Delete receivers',
    description: 'Delete receivers when they are not linked to issue history.',
  },
  {
    permission: 'REPORTS_VIEW',
    group: 'Reports',
    label: 'View reports',
    description: 'Open reports and export operational data.',
  },
  {
    permission: 'CARTRIDGES_VIEW',
    group: 'Cartridges',
    label: 'View cartridges',
    description: 'Search cartridge stock, status, history, and dashboard.',
  },
  {
    permission: 'CARTRIDGES_ADD',
    group: 'Cartridges',
    label: 'Add cartridges',
    description: 'Register cartridge serial numbers in bulk.',
  },
  {
    permission: 'CARTRIDGES_EDIT',
    group: 'Cartridges',
    label: 'Edit cartridges',
    description: 'Edit cartridge master details and notes.',
  },
  {
    permission: 'CARTRIDGES_ISSUE',
    group: 'Cartridges',
    label: 'Issue cartridges',
    description: 'Issue a filled cartridge independently.',
  },
  {
    permission: 'CARTRIDGES_RETURN',
    group: 'Cartridges',
    label: 'Return cartridges',
    description: 'Record empty, unused, damaged, or defective returns.',
  },
  {
    permission: 'CARTRIDGE_GATE_PASSES_VIEW',
    group: 'Cartridges',
    label: 'View Gate Passes',
    description: 'Open the cartridge Gate Pass register and print documents.',
  },
  {
    permission: 'CARTRIDGE_GATE_PASSES_CREATE',
    group: 'Cartridges',
    label: 'Create Gate Passes',
    description: 'Prepare a returnable refilling Gate Pass.',
  },
  {
    permission: 'CARTRIDGE_GATE_PASSES_VERIFY',
    group: 'Cartridges',
    label: 'Verify Gate Passes',
    description: 'Verify a prepared Gate Pass before Gate Out.',
  },
  {
    permission: 'CARTRIDGE_GATE_OUT',
    group: 'Cartridges',
    label: 'Confirm Gate Out',
    description: 'Record serialized cartridges leaving the gate.',
  },
  {
    permission: 'CARTRIDGE_GATE_IN',
    group: 'Cartridges',
    label: 'Confirm Gate In',
    description: 'Record full or partial Gate In on the same pass.',
  },
  {
    permission: 'CARTRIDGE_QC',
    group: 'Cartridges',
    label: 'Perform cartridge QC',
    description: 'Verify refill results and failed cartridges.',
  },
  {
    permission: 'CARTRIDGE_REPORTS_VIEW',
    group: 'Cartridges',
    label: 'View cartridge reports',
    description: 'View and export cartridge activity reports.',
  },
];

export const permissionLabels = {
  ...Object.fromEntries(
    permissionDefinitions.map((definition) => [definition.permission, definition.label]),
  ),
  INVENTORY_MANAGE: 'Manage inventory (legacy)',
  ASSET_TYPES_MANAGE: 'Manage asset types (legacy)',
  ASSET_UNITS_MANAGE: 'Manage asset units (legacy)',
  RECEIVERS_MANAGE: 'Manage receivers (legacy)',
} as Record<WorkerPermission, string>;

const groupedPermissions = permissionDefinitions.reduce<Record<string, PermissionDefinition[]>>(
  (groups, definition) => {
    (groups[definition.group] ??= []).push(definition);
    return groups;
  },
  {},
);

const selectablePermissions = permissionDefinitions.map((definition) => definition.permission);
const selectablePermissionSet = new Set<WorkerPermission>(selectablePermissions);

function unique(values: WorkerPermission[]): WorkerPermission[] {
  const hiddenPermissions = values.filter(
    (permission, index) =>
      !selectablePermissionSet.has(permission) && values.indexOf(permission) === index,
  );
  return [
    ...hiddenPermissions,
    ...selectablePermissions.filter((permission) => values.includes(permission)),
  ];
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
          <Button
            onClick={() => onChange?.(unique([...selected, ...selectablePermissions]))}
            type="button"
            variant="secondary"
          >
            Select all
          </Button>
          <Button
            onClick={() =>
              onChange?.(
                unique([
                  ...selected.filter((permission) => !selectablePermissionSet.has(permission)),
                  'DASHBOARD',
                ]),
              )
            }
            type="button"
            variant="secondary"
          >
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
                        readonly
                          ? 'cursor-default'
                          : 'cursor-pointer hover:border-[var(--color-primary)]',
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

type PermissionGroupName =
  'Dashboard' | 'Issues' | 'Returns' | 'Inventory' | 'Receivers' | 'Reports' | 'Cartridges';

interface PermissionGroupMetadata {
  description: string;
  icon: LucideIcon;
  scope?: keyof WorkerDataAccess;
}

const permissionGroupMetadata: Record<PermissionGroupName, PermissionGroupMetadata> = {
  Dashboard: {
    description: 'Operational overview and assigned activity.',
    icon: LayoutDashboard,
  },
  Issues: {
    description: 'Issue records, receipts, assignments, and due dates.',
    icon: ClipboardList,
    scope: 'issues',
  },
  Returns: {
    description: 'Return history and material return workflows.',
    icon: RotateCcw,
  },
  Inventory: {
    description: 'Materials, asset units, model master, imports, and exports.',
    icon: Boxes,
    scope: 'inventory',
  },
  Receivers: {
    description: 'Receiver directory records and maintenance.',
    icon: ContactRound,
  },
  Reports: {
    description: 'Operational reports and downloads.',
    icon: BarChart3,
  },
  Cartridges: {
    description: 'Cartridge stock, movements, Gate Passes, and quality checks.',
    icon: Printer,
    scope: 'cartridges',
  },
};

const permissionGroupNames = Object.keys(groupedPermissions) as PermissionGroupName[];

const dataScopeCopy: Record<keyof WorkerDataAccess, { label: string; own: string; all: string }> = {
  inventory: {
    label: 'Inventory data visibility',
    own: 'Only inventory records created by this employee.',
    all: 'All inventory records across the platform.',
  },
  issues: {
    label: 'Issue data visibility',
    own: 'Only issue records created by this employee.',
    all: 'All issue and return records across the platform.',
  },
  cartridges: {
    label: 'Cartridge data visibility',
    own: 'Only cartridge records created by this employee.',
    all: 'All cartridge and Gate Pass records across the platform.',
  },
};

function PermissionGroupToggle({
  checked,
  partial,
  group,
  onChange,
}: {
  checked: boolean;
  partial: boolean;
  group: string;
  onChange: (enabled: boolean) => void;
}) {
  const reference = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (reference.current) reference.current.indeterminate = partial;
  }, [partial]);

  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] border border-[var(--color-border)] bg-white px-3 text-sm font-bold text-[var(--color-text-strong)] hover:border-[var(--color-primary-border)]">
      <input
        aria-label={`Enable all ${group} permissions`}
        checked={checked}
        className="size-4 accent-[var(--color-primary)]"
        onChange={(event) => onChange(event.target.checked)}
        ref={reference}
        type="checkbox"
      />
      Enable all in this area
    </label>
  );
}

function DataScopeSelector({
  area,
  value,
  onChange,
}: {
  area: keyof WorkerDataAccess;
  value: WorkerDataAccess;
  onChange: (value: WorkerDataAccess) => void;
}) {
  const copy = dataScopeCopy[area];

  return (
    <fieldset className="rounded-[12px] border border-[var(--color-primary-border)] bg-[var(--color-primary-soft)]/45 p-3 sm:p-4">
      <legend className="px-1 text-sm font-extrabold text-[var(--color-primary-strong)]">
        {copy.label}
      </legend>
      <p className="mt-0.5 text-xs leading-5 text-[var(--color-text-muted)]">
        Applied whenever a selected permission reads or exports this area.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {(
          [
            ['OWN', 'Own data', copy.own],
            ['ALL', 'Whole data', copy.all],
          ] as const
        ).map(([scope, label, description]) => {
          const checked = value[area] === scope;
          return (
            <label
              className={cn(
                'flex min-h-16 cursor-pointer items-start gap-3 rounded-[10px] border bg-white p-3 transition-colors',
                checked
                  ? 'border-[var(--color-primary)] shadow-sm'
                  : 'border-[var(--color-border)] hover:border-[var(--color-primary-border)]',
              )}
              key={scope}
            >
              <input
                checked={checked}
                className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
                name={`managed-data-${area}`}
                onChange={() => onChange({ ...value, [area]: scope })}
                type="radio"
              />
              <span>
                <span className="block text-sm font-extrabold text-[var(--color-text-strong)]">
                  {label}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-[var(--color-text-muted)]">
                  {description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function AccessEditor({
  selected,
  dataAccess,
  onPermissionsChange,
  onDataAccessChange,
}: {
  selected: WorkerPermission[];
  dataAccess: WorkerDataAccess;
  onPermissionsChange: (permissions: WorkerPermission[]) => void;
  onDataAccessChange: (value: WorkerDataAccess) => void;
}) {
  const [activeGroup, setActiveGroup] = useState<PermissionGroupName>('Dashboard');
  const definitions = groupedPermissions[activeGroup] ?? [];
  const metadata = permissionGroupMetadata[activeGroup];
  const groupPermissions = definitions.map((definition) => definition.permission);
  const checkedCount = groupPermissions.filter((permission) =>
    selected.includes(permission),
  ).length;
  const allChecked = checkedCount === groupPermissions.length;
  const visibleSelectedCount = selectablePermissions.filter((permission) =>
    selected.includes(permission),
  ).length;

  function setPermission(permission: WorkerPermission, enabled: boolean) {
    onPermissionsChange(
      enabled ? unique([...selected, permission]) : selected.filter((item) => item !== permission),
    );
  }

  function setGroup(enabled: boolean) {
    onPermissionsChange(
      enabled
        ? unique([...selected, ...groupPermissions])
        : selected.filter((permission) => !groupPermissions.includes(permission)),
    );
  }

  return (
    <section className="overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-white">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-tint)] px-4 py-3 lg:hidden">
        <label className="text-xs font-bold text-[var(--color-text-muted)]" htmlFor="access-area">
          Access area
        </label>
        <select
          className="field-input mt-1"
          id="access-area"
          onChange={(event) => setActiveGroup(event.target.value as PermissionGroupName)}
          value={activeGroup}
        >
          {permissionGroupNames.map((group) => {
            const total = groupedPermissions[group]?.length ?? 0;
            const enabled = (groupedPermissions[group] ?? []).filter((definition) =>
              selected.includes(definition.permission),
            ).length;
            return (
              <option key={group} value={group}>
                {group} ({enabled}/{total})
              </option>
            );
          })}
        </select>
      </div>

      <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden border-r border-[var(--color-border)] bg-[var(--color-surface-tint)] lg:block">
          <div className="border-b border-[var(--color-border)] p-4">
            <p className="text-xs font-bold text-[var(--color-text-muted)]">Access summary</p>
            <p className="mt-1 text-sm font-extrabold text-[var(--color-primary-strong)]">
              {visibleSelectedCount} of {selectablePermissions.length} enabled
            </p>
          </div>
          <nav aria-label="Permission areas" className="space-y-1 p-2">
            {permissionGroupNames.map((group) => {
              const Icon = permissionGroupMetadata[group].icon;
              const groupDefinitions = groupedPermissions[group] ?? [];
              const enabled = groupDefinitions.filter((definition) =>
                selected.includes(definition.permission),
              ).length;
              const active = group === activeGroup;
              return (
                <button
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-12 w-full items-center gap-3 rounded-[10px] px-3 text-left transition-colors',
                    active
                      ? 'bg-white text-[var(--color-primary)] shadow-sm'
                      : 'text-[var(--color-text-muted)] hover:bg-white/70 hover:text-[var(--color-text-strong)]',
                  )}
                  key={group}
                  onClick={() => setActiveGroup(group)}
                  type="button"
                >
                  <Icon aria-hidden="true" className="shrink-0" size={19} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-extrabold">{group}</span>
                    <span className="block text-xs font-semibold">
                      {enabled}/{groupDefinitions.length} enabled
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" className="shrink-0" size={16} />
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0">
          <header className="border-b border-[var(--color-border)] px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-base font-extrabold text-[var(--color-primary-strong)]">
                  {activeGroup}
                </h3>
                <p className="mt-1 max-w-2xl text-sm leading-5 text-[var(--color-text-muted)]">
                  {metadata.description}
                </p>
                <p className="mt-1 text-xs font-bold text-[var(--color-primary)]" role="status">
                  {checkedCount} of {groupPermissions.length} permissions enabled
                </p>
              </div>
              <PermissionGroupToggle
                checked={allChecked}
                group={activeGroup}
                onChange={setGroup}
                partial={checkedCount > 0 && !allChecked}
              />
            </div>
          </header>

          <div className="space-y-4 p-3 sm:p-5">
            {metadata.scope ? (
              <DataScopeSelector
                area={metadata.scope}
                onChange={onDataAccessChange}
                value={dataAccess}
              />
            ) : null}

            <div className="divide-y divide-[var(--color-border)] rounded-[12px] border border-[var(--color-border)] px-3 sm:px-4">
              {definitions.map((definition) => {
                const enabled = selected.includes(definition.permission);
                return (
                  <label
                    className="flex min-h-[68px] cursor-pointer items-start gap-3 py-3.5"
                    key={definition.permission}
                  >
                    <input
                      checked={enabled}
                      className="mt-1 size-4 shrink-0 accent-[var(--color-primary)]"
                      onChange={(event) =>
                        setPermission(definition.permission, event.target.checked)
                      }
                      type="checkbox"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-extrabold text-[var(--color-text-strong)]">
                        {definition.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-[var(--color-text-muted)]">
                        {definition.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function DataAccessMatrix({
  value,
  onChange,
  readonly = false,
}: {
  value: WorkerDataAccess;
  onChange?: (value: WorkerDataAccess) => void;
  readonly?: boolean;
}) {
  function setScope(area: keyof WorkerDataAccess, scope: WorkerDataScope) {
    if (!onChange) return;
    onChange({ ...value, [area]: scope });
  }

  return (
    <section className="rounded-[10px] border border-[var(--color-border)] bg-white p-3">
      <div>
        <h3 className="text-sm font-extrabold text-[var(--color-primary-strong)]">
          Data visibility
        </h3>
        <p className="mt-0.5 text-xs font-semibold text-[var(--color-text-muted)]">
          Choose whether this employee sees only own records or whole platform records.
        </p>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {[
          ['inventory', 'Inventory data', 'Controls inventory list, details, units, and exports.'],
          ['issues', 'Issue data', 'Controls issue list, details, receipts, and return search.'],
          [
            'cartridges',
            'Cartridge data',
            'Controls cartridge records, movements, Gate Passes, and counts.',
          ],
        ].map(([area, label, description]) => (
          <div className="rounded-[8px] border border-[var(--color-border)] p-3" key={area}>
            <p className="text-sm font-bold text-[var(--color-text-strong)]">{label}</p>
            <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">{description}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                ['OWN', 'Own data'],
                ['ALL', 'Whole data'],
              ].map(([scope, scopeLabel]) => {
                const checked = value[area as keyof WorkerDataAccess] === scope;
                return (
                  <label
                    className={cn(
                      'rounded-[8px] border px-3 py-2 text-center text-xs font-extrabold',
                      checked
                        ? 'border-[var(--color-primary-border)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]'
                        : 'border-[var(--color-border)] bg-white text-[var(--color-text-muted)]',
                      readonly ? 'cursor-default' : 'cursor-pointer',
                    )}
                    key={scope}
                  >
                    <input
                      checked={checked}
                      className="sr-only"
                      disabled={readonly}
                      name={`data-${area}`}
                      onChange={() =>
                        setScope(area as keyof WorkerDataAccess, scope as WorkerDataScope)
                      }
                      type="radio"
                    />
                    {scopeLabel}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
