import {
  ChevronDown,
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
  RotateCcw,
  UserRound,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';

import { useAuth } from '../auth/auth-context';
import { Brand, cn } from './ui';

interface NavigationItem {
  label: string;
  to: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  end?: boolean;
  emphasized?: boolean;
}

const navigation: NavigationItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: Home, end: true },
  { label: 'Return', to: '/returns', icon: RotateCcw },
  { label: 'Bills', to: '/bills', icon: ReceiptText },
  { label: 'Inventory', to: '/inventory', icon: Boxes },
  { label: 'Receivers', to: '/receivers', icon: ContactRound },
  { label: 'Workers', to: '/workers', icon: UsersRound, adminOnly: true },
  { label: 'Audit logs', to: '/audit', icon: FileClock, adminOnly: true },
  { label: 'Reports', to: '/reports', icon: FileBarChart, adminOnly: true },
  { label: 'Profile', to: '/profile', icon: UserRound },
];

const issueNavigation: NavigationItem[] = [
  { label: 'Issue material', to: '/issues/new', icon: PackagePlus },
  { label: 'Issues data', to: '/issues', icon: ListChecks, end: true },
  { label: 'Overdue assets', to: '/overdue', icon: FileClock, adminOnly: true },
];

const mobileNavigation: NavigationItem[] = [
  { label: 'Home', to: '/dashboard', icon: Home, end: true },
  { label: 'Issues', to: '/issues', icon: ClipboardList, end: true },
  { label: 'Issue', to: '/issues/new', icon: PackagePlus, emphasized: true },
  { label: 'Return', to: '/returns', icon: RotateCcw },
  { label: 'Bills', to: '/bills', icon: ReceiptText },
  { label: 'Profile', to: '/profile', icon: UserRound },
];

const adminMobileNavigation: NavigationItem[] = [
  ...mobileNavigation.slice(0, 4),
  { label: 'Inventory', to: '/inventory', icon: Boxes },
];

function pageTitle(pathname: string): string {
  if (pathname === '/overdue') return 'Overdue assets';
  if (pathname === '/issues/new') return 'Issue material';
  if (pathname.endsWith('/return') && pathname.startsWith('/issues/')) return 'Record Return';
  if (pathname.startsWith('/issues/')) return 'Issue details';
  if (pathname === '/issues') return 'Issues';
  if (pathname === '/returns') return 'Returns';
  if (pathname.startsWith('/bills/')) return 'Bill';
  if (pathname === '/bills') return 'Bills';
  if (pathname === '/audit') return 'Audit logs';
  if (pathname === '/reports') return 'Reports';
  if (pathname === '/inventory/new') return 'Add material';
  if (pathname.startsWith('/inventory/')) return 'Material details';
  if (pathname === '/inventory') return 'Inventory';
  if (pathname === '/receivers/new') return 'Add receiver';
  if (pathname.startsWith('/receivers/')) return 'Receiver details';
  if (pathname === '/receivers') return 'Receivers';
  if (pathname === '/workers/new') return 'Add worker';
  if (pathname === '/workers/import') return 'Import workers';
  if (pathname.startsWith('/workers/')) return 'Worker details';
  if (pathname === '/workers') return 'Workers';
  if (pathname === '/profile/change-password') return 'Change password';
  if (pathname === '/profile') return 'Profile';
  if (pathname === '/access-denied') return 'Access denied';
  return 'Dashboard';
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
  const children = issueNavigation.filter((item) => !item.adminOnly || auth.user?.role === 'ADMIN');
  const active = location.pathname.startsWith('/issues') || location.pathname === '/overdue';

  if (compact) {
    return (
      <>
        {children.map((item) => (
          <NavigationLink compact item={item} key={item.to} {...(onClick ? { onClick } : {})} />
        ))}
      </>
    );
  }

  return (
    <details className="group" open={active}>
      <summary
        className={cn(
          'flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-[10px] px-3 text-sm font-bold transition-colors [&::-webkit-details-marker]:hidden',
          active
            ? 'bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]'
            : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-tint)] hover:text-[var(--color-primary)]',
        )}
      >
        <ClipboardList aria-hidden="true" className="shrink-0" size={20} />
        <span className="min-w-0 flex-1">Issue</span>
        <ChevronDown
          aria-hidden="true"
          className="shrink-0 transition-transform group-open:rotate-180"
          size={16}
        />
      </summary>
      <div className="mt-1 space-y-1 pl-4">
        {children.map((item) => (
          <NavigationLink item={item} key={item.to} {...(onClick ? { onClick } : {})} />
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
      aria-label={compact ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'group flex min-h-11 items-center rounded-[10px] text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]',
          compact ? 'justify-center px-2' : 'gap-3 px-3',
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
      {!compact ? <span>{item.label}</span> : null}
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
            {auth.user?.role === 'ADMIN' ? 'Admin' : 'Worker'}
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

export function AppShell() {
  const auth = useAuth();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const items = navigation.filter((item) => !item.adminOnly || auth.user?.role === 'ADMIN');
  const mobileItems = auth.user?.role === 'ADMIN' ? adminMobileNavigation : mobileNavigation;

  return (
    <div className="min-h-dvh bg-[var(--color-background)] text-[var(--color-text)]">
      <a
        className="fixed left-3 top-3 z-[70] -translate-y-20 rounded-[10px] bg-white px-4 py-3 font-bold text-[var(--color-primary)] shadow-lg focus:translate-y-0"
        href="#main-content"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] border-r border-[var(--color-border)] bg-white p-4 min-[840px]:flex min-[840px]:flex-col">
        <div className="px-1 py-1">
          <Brand />
        </div>
        <nav aria-label="Main navigation" className="mt-8 min-h-0 flex-1 space-y-1 overflow-y-auto">
          {items.slice(0, 1).map((item) => (
            <NavigationLink item={item} key={item.to} />
          ))}
          <IssueNavigationGroup />
          {items.slice(1).map((item) => (
            <NavigationLink item={item} key={item.to} />
          ))}
        </nav>
        <div className="mt-auto rounded-[12px] bg-[var(--color-surface-tint)] p-3">
          <p className="text-xs font-bold text-[var(--color-primary-strong)]">Signed in as</p>
          <p className="mt-1 truncate text-sm font-semibold text-[var(--color-text-muted)]">
            {auth.user?.workerId}
          </p>
        </div>
      </aside>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[72px] border-r border-[var(--color-border)] bg-white px-3 py-4 min-[600px]:flex min-[840px]:hidden min-[600px]:flex-col">
        <div className="flex justify-center">
          <Brand compact />
        </div>
        <nav aria-label="Main navigation" className="mt-8 min-h-0 flex-1 space-y-2 overflow-y-auto">
          {items.slice(0, 1).map((item) => (
            <NavigationLink compact item={item} key={item.to} />
          ))}
          <IssueNavigationGroup compact />
          {items.slice(1).map((item) => (
            <NavigationLink compact item={item} key={item.to} />
          ))}
        </nav>
      </aside>

      <header className="fixed inset-x-0 top-0 z-30 h-16 border-b border-[var(--color-border)] bg-white/95 backdrop-blur-md min-[600px]:left-[72px] min-[840px]:left-[248px]">
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
        <div className="fixed inset-0 z-50 min-[600px]:hidden">
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
              {items.slice(1).map((item) => (
                <NavigationLink item={item} key={item.to} onClick={() => setDrawerOpen(false)} />
              ))}
            </nav>
          </aside>
        </div>
      ) : null}

      <main
        className="min-h-dvh px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-20 sm:px-6 min-[600px]:ml-[72px] min-[600px]:pb-8 min-[840px]:ml-[248px] lg:px-8"
        id="main-content"
      >
        <div className="mx-auto max-w-[1360px]">
          <Outlet />
        </div>
      </main>

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-30 grid min-h-[68px] border-t border-[var(--color-border)] bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-3px_16px_rgba(67,45,90,.06)] backdrop-blur-md min-[600px]:hidden"
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
