import {
  ChevronDown,
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardList,
  ContactRound,
  Home,
  KeyRound,
  LogOut,
  Menu,
  FileBarChart,
  FileClock,
  ListChecks,
  ReceiptText,
  Boxes,
  PackagePlus,
  Printer,
  Gauge,
  RotateCcw,
  UserRound,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Fragment, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import type { WorkerPermission } from '@assetdesk/contracts';

import { useAuth } from '../auth/auth-context';
import { hasPermission } from '../auth/permissions';
import { DismissibleActionMenus } from './dismissible-action-menus';
import { Brand, cn } from './ui';

interface NavigationItem {
  label: string;
  to: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  permission?: WorkerPermission;
  end?: boolean;
  emphasized?: boolean;
  ariaLabel?: string;
}

interface NavigationGroup {
  label: string;
  icon: LucideIcon;
  items: NavigationItem[];
  activePath: (pathname: string) => boolean;
}

const navigation: NavigationItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: Home, end: true },
  { label: 'Return', to: '/returns', icon: RotateCcw, permission: 'RETURNS_VIEW' },
  {
    label: 'Issue/Return Receipt',
    to: '/bills',
    icon: ReceiptText,
    permission: 'ISSUE_SLIPS_VIEW',
  },
  { label: 'Receivers', to: '/receivers', icon: ContactRound, permission: 'RECEIVERS_VIEW' },
  { label: 'Employees', to: '/workers', icon: UsersRound, adminOnly: true },
  { label: 'Audit logs', to: '/audit', icon: FileClock, adminOnly: true },
  { label: 'Reports', to: '/reports', icon: FileBarChart, adminOnly: true },
  { label: 'Profile', to: '/profile', icon: UserRound },
];

const inventoryNavigation: NavigationItem[] = [
  {
    label: 'Inventory data',
    to: '/inventory',
    icon: Boxes,
    end: true,
    ariaLabel: 'Inventory',
    permission: 'INVENTORY_VIEW',
  },
  { label: 'Add material', to: '/inventory/new', icon: PackagePlus, permission: 'INVENTORY_ADD' },
];

const gatePassNavigation: NavigationItem[] = [
  {
    label: 'Gate Pass Out',
    to: '/inventory/gate-passes/out',
    icon: ArrowUpFromLine,
    permission: 'GATE_PASS_VIEW',
  },
  {
    label: 'Gate Pass In',
    to: '/inventory/gate-passes/in',
    icon: ArrowDownToLine,
    permission: 'GATE_PASS_VIEW',
  },
  {
    label: 'Gate Pass Data',
    to: '/inventory/gate-passes/data',
    icon: ReceiptText,
    permission: 'GATE_PASS_VIEW',
  },
];

const assetDetailsNavigation: NavigationItem[] = [
  {
    label: 'Add asset types',
    to: '/inventory/asset-types/add',
    icon: PackagePlus,
    permission: 'ASSET_TYPES_MANAGE',
  },
  {
    label: 'View asset types',
    to: '/inventory/asset-types/view',
    icon: ListChecks,
    permission: 'ASSET_TYPES_MANAGE',
  },
];

const issueNavigation: NavigationItem[] = [
  {
    label: 'Issue material',
    to: '/issues/new',
    icon: PackagePlus,
    permission: 'ASSIGNMENTS_CREATE',
  },
  { label: 'Issues data', to: '/issues', icon: ListChecks, end: true, permission: 'ISSUES_VIEW' },
  { label: 'Overdue assets', to: '/overdue', icon: FileClock, adminOnly: true },
];
const cartridgeNavigation: NavigationItem[] = [
  { label: 'Dashboard', to: '/cartridges/dashboard', icon: Gauge, permission: 'CARTRIDGES_VIEW' },
  {
    label: 'All cartridges',
    to: '/cartridges',
    icon: Printer,
    end: true,
    permission: 'CARTRIDGES_VIEW',
  },
  {
    label: 'Add cartridges',
    to: '/cartridges/new',
    icon: PackagePlus,
    permission: 'CARTRIDGES_ADD',
  },
  {
    label: 'Issue cartridge',
    to: '/cartridges/issues/new',
    icon: PackagePlus,
    permission: 'CARTRIDGES_ISSUE',
  },
  {
    label: 'Issued data',
    to: '/cartridges?status=ISSUED',
    icon: ListChecks,
    permission: 'CARTRIDGES_VIEW',
  },
  {
    label: 'Return cartridge',
    to: '/cartridges/returns/new',
    icon: RotateCcw,
    permission: 'CARTRIDGES_RETURN',
  },
  {
    label: 'Return data',
    to: '/cartridges/activity?type=RETURNED',
    icon: FileClock,
    permission: 'CARTRIDGES_VIEW',
  },
  {
    label: 'Gate Pass Out',
    to: '/cartridges/gate-passes',
    icon: ReceiptText,
    permission: 'CARTRIDGE_GATE_PASSES_VIEW',
  },
  {
    label: 'Gate Pass In',
    to: '/cartridges/gate-in',
    icon: ListChecks,
    permission: 'CARTRIDGE_GATE_IN',
  },
  {
    label: 'Gate Pass Database',
    to: '/cartridges/gate-passes/database',
    icon: FileBarChart,
    permission: 'CARTRIDGE_GATE_PASSES_VIEW',
  },
  {
    label: 'Activity log',
    to: '/cartridges/activity',
    icon: FileClock,
    permission: 'CARTRIDGES_VIEW',
  },
];

const cartridgeNavigationSections: Array<{
  label: string;
  icon: LucideIcon;
  items: NavigationItem[];
  activePath: (pathname: string, search: string) => boolean;
}> = [
  {
    label: 'Overview',
    icon: Gauge,
    items: cartridgeNavigation.slice(0, 3),
    activePath: (pathname) =>
      pathname === '/cartridges/dashboard' ||
      pathname === '/cartridges' ||
      pathname === '/cartridges/new',
  },
  {
    label: 'Issue / Return',
    icon: RotateCcw,
    items: cartridgeNavigation.slice(3, 7),
    activePath: (pathname, search) =>
      pathname.startsWith('/cartridges/issues') ||
      pathname.startsWith('/cartridges/returns') ||
      (pathname === '/cartridges' && search.includes('status=ISSUED')) ||
      (pathname === '/cartridges/activity' && search.includes('type=RETURNED')),
  },
  {
    label: 'Gate Pass',
    icon: ReceiptText,
    items: cartridgeNavigation.slice(7, 10),
    activePath: (pathname, search) =>
      pathname.startsWith('/cartridges/gate-passes') ||
      pathname === '/cartridges/gate-in' ||
      (pathname === '/cartridges/activity' &&
        (search.includes('type=GATE_OUT') || search.includes('type=GATE_IN'))),
  },
  {
    label: 'Logs',
    icon: FileClock,
    items: cartridgeNavigation.slice(10),
    activePath: (pathname, search) => pathname === '/cartridges/activity' && !search,
  },
];

const mobileNavigation: NavigationItem[] = [
  { label: 'Home', to: '/dashboard', icon: Home, end: true },
  { label: 'Issues', to: '/issues', icon: ClipboardList, end: true, permission: 'ISSUES_VIEW' },
  {
    label: 'Issue',
    to: '/issues/new',
    icon: PackagePlus,
    emphasized: true,
    permission: 'ASSIGNMENTS_CREATE',
  },
  { label: 'Return', to: '/returns', icon: RotateCcw, permission: 'RETURNS_VIEW' },
  { label: 'Receipt', to: '/bills', icon: ReceiptText, permission: 'ISSUE_SLIPS_VIEW' },
  { label: 'Profile', to: '/profile', icon: UserRound },
];

const adminMobileNavigation: NavigationItem[] = [
  ...mobileNavigation.slice(0, 4),
  { label: 'Inventory', to: '/inventory', icon: Boxes },
];

function pageTitle(pathname: string): string {
  if (pathname === '/cartridges/dashboard') return 'Cartridge Dashboard';
  if (pathname === '/cartridges/activity') return 'Cartridge Activity Log';
  if (pathname === '/cartridges/new') return 'Add Cartridges';
  if (pathname === '/cartridges/issues/new') return 'Issue Cartridge';
  if (pathname === '/cartridges/returns/new') return 'Return Cartridge';
  if (pathname === '/cartridges/gate-passes/new') return 'Create Gate Pass Out';
  if (pathname === '/cartridges/gate-in') return 'Gate Pass In';
  if (pathname === '/cartridges/gate-passes/database') return 'Gate Pass Database';
  if (pathname.includes('/cartridges/gate-passes/')) return 'Gate Pass';
  if (pathname === '/cartridges/gate-passes') return 'Gate Pass Out';
  if (pathname.startsWith('/cartridges/')) return 'Cartridge Details';
  if (pathname === '/cartridges') return 'Cartridges';
  if (pathname === '/overdue') return 'Overdue assets';
  if (pathname === '/issues/new') return 'Issue material';
  if (pathname.endsWith('/return') && pathname.startsWith('/issues/')) return 'Record Return';
  if (pathname.startsWith('/issues/')) return 'Issue details';
  if (pathname === '/issues') return 'Issues';
  if (pathname === '/returns') return 'Returns';
  if (pathname.startsWith('/bills/')) return 'Issue/Return Receipt';
  if (pathname === '/bills') return 'Issue/Return Receipt';
  if (pathname === '/audit') return 'Audit logs';
  if (pathname === '/reports') return 'Reports';
  if (pathname === '/inventory/new') return 'Add material';
  if (pathname === '/inventory/gate-passes/out/new') return 'Create Gate Pass Out';
  if (pathname === '/inventory/gate-passes/out') return 'Gate Pass Out';
  if (pathname === '/inventory/gate-passes/in') return 'Gate Pass In';
  if (pathname === '/inventory/gate-passes/data') return 'Gate Pass Data';
  if (pathname.startsWith('/inventory/gate-passes/')) return 'Inventory Gate Pass';
  if (pathname === '/inventory/import') return 'Bulk inventory upload';
  if (pathname === '/inventory/asset-types/view') return 'View asset types';
  if (pathname.startsWith('/inventory/asset-types')) return 'Add asset types';
  if (pathname.startsWith('/inventory/')) return 'Material details';
  if (pathname === '/inventory') return 'Inventory';
  if (pathname === '/receivers/new') return 'Add receiver';
  if (pathname.startsWith('/receivers/')) return 'Receiver details';
  if (pathname === '/receivers') return 'Receivers';
  if (pathname === '/workers/new') return 'Add employee';
  if (pathname === '/workers/import') return 'Import employees';
  if (pathname.startsWith('/workers/')) return 'Employee details';
  if (pathname === '/workers') return 'Employees';
  if (pathname === '/profile/change-password') return 'Change password';
  if (pathname === '/profile') return 'Profile';
  if (pathname === '/access-denied') return 'Access denied';
  return 'Dashboard';
}

function canShowItem(user: ReturnType<typeof useAuth>['user'], item: NavigationItem): boolean {
  if (item.adminOnly && user?.role !== 'ADMIN') return false;
  return !item.permission || hasPermission(user, item.permission);
}

function closeSiblingDetails(event: ReactMouseEvent<HTMLElement>) {
  const summary = event.currentTarget;
  const details = summary.parentElement;
  const parent = details?.parentElement;
  if (!parent) return;
  for (const sibling of parent.children) {
    if (sibling instanceof HTMLDetailsElement && sibling !== details && sibling.open) {
      sibling.open = false;
    }
  }
}

function IssueNavigationGroup({
  compact = false,
  onClick,
}: {
  compact?: boolean;
  onClick?: () => void;
}) {
  const auth = useAuth();
  const location = useLocation();
  const children = issueNavigation.filter((item) => canShowItem(auth.user, item));
  const active = location.pathname.startsWith('/issues') || location.pathname === '/overdue';

  return (
    <details className="group" open={active}>
      <summary
        onClick={closeSiblingDetails}
        className={cn(
          'sidebar-nav-link flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-[10px] text-sm font-bold transition-colors [&::-webkit-details-marker]:hidden',
          compact ? 'px-2.5' : 'px-3',
          active
            ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]'
            : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-tint)] hover:text-[var(--color-primary)]',
        )}
      >
        <ClipboardList aria-hidden="true" className="shrink-0" size={20} />
        <span className={compact ? 'sidebar-label min-w-0 flex-1 truncate' : 'min-w-0 flex-1'}>
          Issue
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'shrink-0 transition-transform group-open:rotate-180',
            compact && 'sidebar-chevron',
          )}
          size={16}
        />
      </summary>
      <div className={cn('sidebar-subnav mt-1 space-y-1', compact ? 'pl-0' : 'pl-4')}>
        {children.map((item) => (
          <NavigationLink
            compact={compact}
            item={item}
            key={item.to}
            {...(onClick ? { onClick } : {})}
          />
        ))}
      </div>
    </details>
  );
}

function InventoryNavigationGroup({
  compact = false,
  onClick,
}: {
  compact?: boolean;
  onClick?: () => void;
}) {
  const auth = useAuth();
  const location = useLocation();
  const inventoryItems = inventoryNavigation.filter((item) => canShowItem(auth.user, item));
  const gatePassItems = gatePassNavigation.filter((item) => canShowItem(auth.user, item));
  const active =
    location.pathname.startsWith('/inventory') &&
    !location.pathname.startsWith('/inventory/asset-types');
  const gatePassActive = location.pathname.startsWith('/inventory/gate-passes');

  return (
    <details className="group" open={active}>
      <summary
        onClick={closeSiblingDetails}
        className={cn(
          'sidebar-nav-link flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-[10px] text-sm font-bold transition-colors [&::-webkit-details-marker]:hidden',
          compact ? 'px-2.5' : 'px-3',
          active
            ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]'
            : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-tint)] hover:text-[var(--color-primary)]',
        )}
      >
        <Boxes aria-hidden="true" className="shrink-0" size={20} />
        <span className={compact ? 'sidebar-label min-w-0 flex-1 truncate' : 'min-w-0 flex-1'}>
          Inventory
        </span>
        <ChevronDown
          aria-hidden="true"
          className="shrink-0 transition-transform group-open:rotate-180"
          size={16}
        />
      </summary>
      <div className={cn('sidebar-subnav mt-1 space-y-1', compact ? 'pl-0' : 'pl-4')}>
        {inventoryItems.map((item) => (
          <NavigationLink
            compact={compact}
            item={item}
            key={item.to}
            {...(onClick ? { onClick } : {})}
          />
        ))}
        {gatePassItems.length ? (
          <details className="group/gate-pass" open={gatePassActive}>
            <summary
              onClick={closeSiblingDetails}
              className={cn(
                'sidebar-nav-link flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-[10px] text-sm font-bold transition-colors [&::-webkit-details-marker]:hidden',
                compact ? 'px-2.5' : 'px-3',
                gatePassActive
                  ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-tint)] hover:text-[var(--color-primary)]',
              )}
            >
              <ReceiptText aria-hidden="true" className="shrink-0" size={20} />
              <span
                className={compact ? 'sidebar-label min-w-0 flex-1 truncate' : 'min-w-0 flex-1'}
              >
                Gate Pass
              </span>
              <ChevronDown
                aria-hidden="true"
                className="shrink-0 transition-transform group-open/gate-pass:rotate-180"
                size={15}
              />
            </summary>
            <div className={cn('sidebar-subnav mt-1 space-y-1', compact ? 'pl-0' : 'pl-4')}>
              {gatePassItems.map((item) => (
                <NavigationLink
                  compact={compact}
                  item={item}
                  key={item.to}
                  {...(onClick ? { onClick } : {})}
                />
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </details>
  );
}

function NavigationGroupMenu({
  group,
  compact = false,
  onClick,
}: {
  group: NavigationGroup;
  compact?: boolean;
  onClick?: () => void;
}) {
  const auth = useAuth();
  const location = useLocation();
  const children = group.items.filter((item) => canShowItem(auth.user, item));
  const active = group.activePath(location.pathname);
  const Icon = group.icon;

  return (
    <details className="group" open={active}>
      <summary
        onClick={closeSiblingDetails}
        className={cn(
          'sidebar-nav-link flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-[10px] text-sm font-bold transition-colors [&::-webkit-details-marker]:hidden',
          compact ? 'px-2.5' : 'px-3',
          active
            ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]'
            : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-tint)] hover:text-[var(--color-primary)]',
        )}
      >
        <Icon aria-hidden="true" className="shrink-0" size={20} />
        <span className={compact ? 'sidebar-label min-w-0 flex-1 truncate' : 'min-w-0 flex-1'}>
          {group.label}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="shrink-0 transition-transform group-open:rotate-180"
          size={16}
        />
      </summary>
      <div className={cn('sidebar-subnav mt-1 space-y-1', compact ? 'pl-0' : 'pl-4')}>
        {children.map((item) => (
          <NavigationLink
            compact={compact}
            item={item}
            key={item.to}
            {...(onClick ? { onClick } : {})}
          />
        ))}
      </div>
    </details>
  );
}

function NavigationLink({
  item,
  compact = false,
  onClick,
}: {
  item: NavigationItem;
  compact?: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <NavLink
      aria-label={compact ? (item.ariaLabel ?? item.label) : undefined}
      className={({ isActive }) =>
        cn(
          'sidebar-nav-link group flex min-h-11 items-center rounded-[10px] text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]',
          compact ? 'justify-start gap-3 px-2.5' : 'gap-3 px-3',
          isActive
            ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]'
            : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-tint)] hover:text-[var(--color-primary)]',
        )
      }
      onClick={onClick}
      {...(item.end !== undefined ? { end: item.end } : {})}
      title={compact ? item.label : undefined}
      to={item.to}
    >
      <Icon aria-hidden="true" className="shrink-0" size={20} />
      <span className={compact ? 'sidebar-label truncate' : undefined}>{item.label}</span>
    </NavLink>
  );
}

function ProfileMenu() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeOnOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const initials = auth.user?.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  async function signOut() {
    setOpen(false);
    await auth.logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-controls="profile-popover"
        aria-expanded={open}
        className="flex min-h-11 items-center gap-2 rounded-[10px] px-1.5 text-left transition-colors hover:bg-[var(--color-surface-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)] sm:px-2"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="grid size-9 place-items-center rounded-[10px] bg-[var(--color-primary-soft)] text-sm font-extrabold text-[var(--color-primary-strong)]">
          {initials || 'AD'}
        </span>
        <span className="hidden max-w-36 sm:block">
          <span className="block truncate text-sm font-bold text-[var(--color-text-strong)]">
            {auth.user?.name}
          </span>
          <span className="block text-xs font-semibold text-[var(--color-text-muted)]">
            {auth.user?.role === 'ADMIN' ? 'Admin' : 'Employee'}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className="hidden text-[var(--color-text-muted)] sm:block"
          size={16}
        />
      </button>

      {open ? (
        <div
          className="absolute right-0 z-50 mt-2 w-64 rounded-[14px] border border-[var(--color-border)] bg-white p-2 shadow-[var(--shadow-overlay)]"
          id="profile-popover"
        >
          <div className="border-b border-[var(--color-border)] px-3 py-2.5">
            <p className="truncate text-sm font-bold text-[var(--color-text-strong)]">
              {auth.user?.name}
            </p>
            <p className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]">
              {auth.user?.email}
            </p>
          </div>
          <NavLink className="menu-item mt-1" onClick={() => setOpen(false)} to="/profile">
            <UserRound aria-hidden="true" size={18} />
            My profile
          </NavLink>
          <NavLink
            className="menu-item"
            onClick={() => setOpen(false)}
            to="/profile/change-password"
          >
            <KeyRound aria-hidden="true" size={18} />
            Change password
          </NavLink>
          <button
            className="menu-item w-full text-[var(--color-danger)]"
            onClick={() => void signOut()}
            type="button"
          >
            <LogOut aria-hidden="true" size={18} />
            Logout
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CartridgeNavigationGroup({
  compact = false,
  onClick,
}: {
  compact?: boolean;
  onClick?: () => void;
}) {
  const auth = useAuth();
  const location = useLocation();
  const active = location.pathname.startsWith('/cartridges');
  const visibleSections = cartridgeNavigationSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canShowItem(auth.user, item)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <details className="group" open={active}>
      <summary
        onClick={closeSiblingDetails}
        className={cn(
          'sidebar-nav-link flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-[10px] text-sm font-bold transition-colors [&::-webkit-details-marker]:hidden',
          compact ? 'px-2.5' : 'px-3',
          active
            ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]'
            : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-tint)] hover:text-[var(--color-primary)]',
        )}
      >
        <Printer aria-hidden="true" className="shrink-0" size={20} />
        <span className={compact ? 'sidebar-label min-w-0 flex-1 truncate' : 'min-w-0 flex-1'}>
          Cartridges
        </span>
        <ChevronDown
          aria-hidden="true"
          className="shrink-0 transition-transform group-open:rotate-180"
          size={16}
        />
      </summary>
      <div className={cn('sidebar-subnav mt-1 space-y-1', compact ? 'pl-0' : 'pl-4')}>
        {visibleSections.map((section) => {
          const SectionIcon = section.icon;
          const sectionActive = section.activePath(location.pathname, location.search);
          return (
            <details
              className="group/cartridge"
              key={section.label}
              open={sectionActive}
            >
              <summary
                onClick={closeSiblingDetails}
                className={cn(
                  'sidebar-nav-link flex min-h-10 cursor-pointer list-none items-center gap-3 rounded-[10px] text-xs font-extrabold uppercase tracking-[0.02em] transition-colors [&::-webkit-details-marker]:hidden',
                  compact ? 'px-2.5' : 'px-3',
                  sectionActive
                    ? 'bg-white/15 text-white'
                    : 'text-white/75 hover:bg-white/10 hover:text-white',
                )}
              >
                <SectionIcon aria-hidden="true" className="shrink-0" size={17} />
                <span
                  className={compact ? 'sidebar-label min-w-0 flex-1 truncate' : 'min-w-0 flex-1'}
                >
                  {section.label}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className="shrink-0 transition-transform group-open/cartridge:rotate-180"
                  size={14}
                />
              </summary>
              <div className={cn('mt-1 space-y-1', compact ? 'pl-3' : 'pl-4')}>
                {section.items.map((item) => (
                  <NavigationLink
                    compact={compact}
                    item={item}
                    key={item.to}
                    {...(onClick ? { onClick } : {})}
                  />
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </details>
  );
}

export function AppShell() {
  const auth = useAuth();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const items = navigation.filter((item) => canShowItem(auth.user, item));
  const mobileItems = (
    auth.user?.role === 'ADMIN' ? adminMobileNavigation : mobileNavigation
  ).filter((item) => canShowItem(auth.user, item));

  return (
    <div className="min-h-dvh bg-[var(--color-background)] text-[var(--color-text)]">
      <DismissibleActionMenus />
      <a
        className="fixed left-3 top-3 z-[70] -translate-y-20 rounded-[10px] bg-white px-4 py-3 font-bold text-[var(--color-primary)] shadow-lg focus:translate-y-0"
        href="#main-content"
      >
        Skip to content
      </a>

      <aside
        className="app-sidebar fixed inset-y-0 left-0 z-40 hidden px-3 py-4 min-[600px]:flex min-[600px]:flex-col"
        onMouseLeave={(event) => {
          const focused = document.activeElement;
          if (focused instanceof HTMLElement && event.currentTarget.contains(focused))
            focused.blur();
        }}
      >
        <div className="sidebar-brand px-1">
          <Brand />
        </div>
        <nav
          aria-label="Main navigation"
          className="sidebar-scroll mt-8 min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden"
        >
          {items.slice(0, 1).map((item) => (
            <NavigationLink compact item={item} key={item.to} />
          ))}
          <IssueNavigationGroup compact />
          <InventoryNavigationGroup compact />
          <NavigationGroupMenu
            compact
            group={{
              label: 'Asset details',
              icon: ClipboardList,
              items: assetDetailsNavigation,
              activePath: (pathname) => pathname.startsWith('/inventory/asset-types'),
            }}
          />
          {items.slice(1).map((item) => (
            <Fragment key={item.to}>
              <NavigationLink compact item={item} />
              {item.label === 'Employees' ? <CartridgeNavigationGroup compact /> : null}
            </Fragment>
          ))}
          {!items.some((item) => item.label === 'Employees') ? (
            <CartridgeNavigationGroup compact />
          ) : null}
        </nav>
        <div className="sidebar-user mt-auto rounded-[10px] p-2.5">
          <p className="sidebar-label text-[10px] font-extrabold uppercase tracking-[0.02em] text-[var(--color-primary-strong)]">
            Signed in
          </p>
          <p className="sidebar-label mt-1 truncate text-[11px] font-semibold text-[var(--color-text-muted)]">
            {auth.user?.workerId}
          </p>
        </div>
      </aside>

      <header className="app-topbar fixed inset-x-0 top-0 z-30 h-16 border-b border-[var(--color-border)] bg-white/95 backdrop-blur-md min-[600px]:left-[72px]">
        <div className="flex h-full items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              aria-label="Open menu"
              className="icon-button min-[600px]:hidden"
              onClick={() => setDrawerOpen(true)}
              type="button"
            >
              <Menu aria-hidden="true" size={21} />
            </button>
            <h2 className="truncate text-base font-extrabold text-[var(--color-primary-strong)]">
              {pageTitle(location.pathname)}
            </h2>
          </div>
          <ProfileMenu />
        </div>
      </header>

      {drawerOpen ? (
        <div className="app-drawer fixed inset-0 z-50 min-[600px]:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-slate-950/35"
            onClick={() => setDrawerOpen(false)}
            type="button"
          />
          <aside className="relative flex h-full w-[min(84vw,300px)] flex-col bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <Brand />
              <button
                aria-label="Close menu"
                className="icon-button"
                onClick={() => setDrawerOpen(false)}
                type="button"
              >
                <X aria-hidden="true" size={21} />
              </button>
            </div>
            <nav aria-label="Mobile menu" className="mt-8 min-h-0 flex-1 space-y-1 overflow-y-auto">
              {items.slice(0, 1).map((item) => (
                <NavigationLink item={item} key={item.to} onClick={() => setDrawerOpen(false)} />
              ))}
              <IssueNavigationGroup onClick={() => setDrawerOpen(false)} />
              <InventoryNavigationGroup onClick={() => setDrawerOpen(false)} />
              <NavigationGroupMenu
                group={{
                  label: 'Asset details',
                  icon: ClipboardList,
                  items: assetDetailsNavigation,
                  activePath: (pathname) => pathname.startsWith('/inventory/asset-types'),
                }}
                onClick={() => setDrawerOpen(false)}
              />
              {items.slice(1).map((item) => (
                <Fragment key={item.to}>
                  <NavigationLink item={item} onClick={() => setDrawerOpen(false)} />
                  {item.label === 'Employees' ? (
                    <CartridgeNavigationGroup onClick={() => setDrawerOpen(false)} />
                  ) : null}
                </Fragment>
              ))}
              {!items.some((item) => item.label === 'Employees') ? (
                <CartridgeNavigationGroup onClick={() => setDrawerOpen(false)} />
              ) : null}
            </nav>
          </aside>
        </div>
      ) : null}

      <main
        className="min-h-dvh px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-20 sm:px-6 min-[600px]:ml-[72px] min-[600px]:pb-8 lg:px-8"
        id="main-content"
      >
        <div className="mx-auto max-w-[1680px]">
          <Outlet />
        </div>
      </main>

      <nav
        aria-label="Mobile navigation"
        className="app-mobile-nav fixed inset-x-0 bottom-0 z-30 grid min-h-[68px] border-t border-[var(--color-border)] bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-3px_16px_rgba(67,45,90,.06)] backdrop-blur-md min-[600px]:hidden"
        style={{ gridTemplateColumns: `repeat(${mobileItems.length}, minmax(0, 1fr))` }}
      >
        {mobileItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              className={({ isActive }) =>
                cn(
                  'flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-[10px] text-[11px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--color-focus)]',
                  item.emphasized && '-mt-3',
                  isActive
                    ? 'text-[var(--color-primary)]'
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-tint)]',
                )
              }
              key={item.to}
              {...(item.end !== undefined ? { end: item.end } : {})}
              to={item.to}
            >
              <span
                className={cn(
                  'grid place-items-center',
                  item.emphasized &&
                    'size-11 rounded-full bg-[var(--color-primary)] text-white shadow-[0_4px_14px_rgba(109,40,217,.3)]',
                )}
              >
                <Icon aria-hidden="true" size={item.emphasized ? 23 : 22} />
              </span>
              {item.label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
