import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Boxes,
  ChevronRight,
  ClipboardList,
  ContactRound,
  History,
  Printer,
  ReceiptText,
  ScanBarcode,
  Search,
  SlidersHorizontal,
  Truck,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import { Link, useNavigate } from 'react-router';

import type { SearchEntityType, SearchResult } from '@assetdesk/contracts';

import { globalSearch } from '../lib/search-api';
import { HighlightText } from '../lib/search-highlight';
import { CatalogBadge } from './catalog-ui';
import { cn } from './ui';

export const searchTypeIcons: Record<SearchEntityType, LucideIcon> = {
  ISSUE: ClipboardList,
  MATERIAL: Boxes,
  ASSET_UNIT: ScanBarcode,
  CARTRIDGE: Printer,
  CARTRIDGE_GATE_PASS: ReceiptText,
  GATE_PASS: Truck,
  RECEIVER: ContactRound,
  EMPLOYEE: UsersRound,
};

const RECENT_KEY = 'assetdesk:recent-searches';
const MAX_RECENT = 6;

function readRecentSearches(): string[] {
  try {
    const stored = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(stored)
      ? stored.filter((value): value is string => typeof value === 'string').slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

export function rememberSearch(value: string): void {
  const search = value.trim();
  if (search.length < 2) return;
  try {
    const next = [search, ...readRecentSearches().filter((item) => item !== search)].slice(
      0,
      MAX_RECENT,
    );
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Recent searches are a convenience only.
  }
}

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

export function SearchPath({ path }: { path: string[] }) {
  return (
    <span aria-label={`Found in ${path.join(' › ')}`} className="search-path">
      {path.map((part, index) => (
        <Fragment key={`${index}:${part}`}>
          {index > 0 ? <ChevronRight aria-hidden="true" className="shrink-0" size={12} /> : null}
          <span className={index === path.length - 1 ? 'search-path-current' : undefined}>
            {part}
          </span>
        </Fragment>
      ))}
    </span>
  );
}

export function SearchResultContent({ result, search }: { result: SearchResult; search: string }) {
  const Icon = searchTypeIcons[result.type];
  return (
    <>
      <span className="search-result-icon">
        <Icon aria-hidden="true" size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 truncate text-sm font-extrabold text-[var(--color-text-strong)]">
            <HighlightText search={search} text={result.title} />
          </span>
          {result.status ? <CatalogBadge value={result.status} /> : null}
        </span>
        {result.subtitle ? (
          <span className="mt-0.5 block truncate text-xs text-[var(--color-text-muted)]">
            <HighlightText search={search} text={result.subtitle} />
          </span>
        ) : null}
        <SearchPath path={result.path} />
        {result.matchedField ? (
          <span className="search-match-chip">
            {result.matchedValue ? (
              <>
                {result.matchedField}: <HighlightText search={search} text={result.matchedValue} />
              </>
            ) : (
              `Matched by ${result.matchedField.toLowerCase()}`
            )}
          </span>
        ) : null}
      </span>
    </>
  );
}

function SearchBox({
  inputRef,
  overlay = false,
  onClose,
}: {
  inputRef?: RefObject<HTMLInputElement | null>;
  overlay?: boolean;
  onClose?: () => void;
}) {
  const navigate = useNavigate();
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(overlay);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>(readRecentSearches);
  const search = text.trim();
  const debounced = useDebouncedValue(search, 250);
  const enabled = debounced.length >= 2;

  const query = useQuery({
    queryKey: ['global-search', 'quick', debounced],
    queryFn: ({ signal }) => globalSearch({ q: debounced, limit: 4 }, signal),
    enabled,
    staleTime: 15_000,
    placeholderData: (previous) => previous,
  });
  const groups = useMemo(() => (enabled ? (query.data?.groups ?? []) : []), [enabled, query.data]);
  const results = useMemo(() => groups.flatMap((group) => group.results), [groups]);

  useEffect(() => {
    if (overlay || !open) return;
    function closeOnOutside(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', closeOnOutside);
    return () => document.removeEventListener('pointerdown', closeOnOutside);
  }, [open, overlay]);

  function finish() {
    setOpen(overlay);
    setActive(-1);
    inputRef?.current?.blur();
    onClose?.();
  }

  function go(href: string) {
    rememberSearch(search);
    setRecent(readRecentSearches());
    finish();
    navigate(href);
  }

  function searchPage(options: { filters?: boolean; type?: SearchEntityType; q?: string } = {}) {
    const parameters = new URLSearchParams();
    const q = options.q ?? search;
    if (q) parameters.set('q', q);
    if (options.type) parameters.set('type', options.type);
    if (options.filters) parameters.set('filters', '1');
    go(`/search${parameters.size ? `?${parameters.toString()}` : ''}`);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!results.length) return;
      event.preventDefault();
      setOpen(true);
      const down = event.key === 'ArrowDown';
      // -1 means focus stays in the input; the cycle wraps through every result.
      setActive((current) => {
        if (down) return current + 1 >= results.length ? -1 : current + 1;
        return current <= -1 ? results.length - 1 : current - 1;
      });
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const selected = active >= 0 ? results[active] : undefined;
      if (selected) go(selected.href);
      else if (search.length >= 2) searchPage();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (text) setText('');
      else finish();
    }
  }

  const activeResult = active >= 0 ? results[active] : undefined;
  const showPanel = overlay || (open && (search.length > 0 || recent.length > 0));
  let optionIndex = -1;

  return (
    <div className={cn('global-search', overlay && 'global-search-overlay-box')} ref={containerRef}>
      <div className="global-search-field">
        {overlay ? (
          <button
            aria-label="Close search"
            className="icon-button size-9 min-h-9 shrink-0"
            onClick={finish}
            type="button"
          >
            <ArrowLeft aria-hidden="true" size={18} />
          </button>
        ) : (
          <Search
            aria-hidden="true"
            className="shrink-0 text-[var(--color-text-muted)]"
            size={18}
          />
        )}
        <input
          aria-activedescendant={activeResult ? `${listboxId}-${activeResult.key}` : undefined}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={showPanel}
          aria-label="Search everything"
          autoComplete="off"
          autoFocus={overlay}
          className="global-search-input"
          onChange={(event) => {
            setText(event.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search serial no., Issue ID, asset, cartridge, gate pass…"
          ref={inputRef}
          role="combobox"
          spellCheck={false}
          type="search"
          value={text}
        />
        {text ? (
          <button
            aria-label="Clear search"
            className="global-search-clear"
            onClick={() => {
              setText('');
              inputRef?.current?.focus();
            }}
            type="button"
          >
            <X aria-hidden="true" size={16} />
          </button>
        ) : !overlay ? (
          <kbd className="global-search-kbd" title="Press Ctrl+K or / to search">
            Ctrl K
          </kbd>
        ) : null}
      </div>

      {showPanel ? (
        <div className="global-search-panel" id={listboxId} role="listbox">
          {search.length < 2 ? (
            <div className="p-3">
              {recent.length ? (
                <>
                  <p className="px-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                    Recent searches
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {recent.map((item) => (
                      <button
                        className="search-recent-chip"
                        key={item}
                        onClick={() => {
                          setText(item);
                          setActive(-1);
                          inputRef?.current?.focus();
                        }}
                        type="button"
                      >
                        <History aria-hidden="true" size={13} />
                        {item}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
              <p className="mt-3 px-1 text-xs leading-5 text-[var(--color-text-muted)]">
                Type at least 2 characters. Search matches serial numbers, asset tags, Issue IDs,
                models, configurations, locations, cartridges, gate passes, receivers and employees.
              </p>
              <button
                className="button-quiet mt-2 min-h-9 text-xs"
                onClick={() => searchPage({ filters: true, q: '' })}
                type="button"
              >
                <SlidersHorizontal aria-hidden="true" size={15} />
                Search with filters
              </button>
            </div>
          ) : query.isError ? (
            <p className="p-4 text-sm font-bold text-[var(--color-danger)]" role="alert">
              Search is unavailable right now. Try again.
            </p>
          ) : !query.data || (query.isFetching && debounced !== query.data.query) ? (
            <div className="space-y-2 p-3" role="status">
              <span className="sr-only">Searching</span>
              {[0, 1, 2].map((index) => (
                <div className="skeleton h-12 rounded-[10px]" key={index} />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div className="p-5 text-center">
              <p className="text-sm font-extrabold text-[var(--color-primary-strong)]">
                No records match “{debounced}”
              </p>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Check the spelling or search a shorter part of the serial number.
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <div className="py-1" key={group.type} role="group" aria-label={group.label}>
                <div className="flex items-center justify-between px-3 pb-1 pt-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                    {group.label} · {group.total}
                  </span>
                  {group.total > group.results.length ? (
                    <button
                      className="text-xs font-extrabold text-[var(--color-primary)] hover:underline"
                      onClick={() => searchPage({ type: group.type })}
                      type="button"
                    >
                      View all
                    </button>
                  ) : null}
                </div>
                {group.results.map((result) => {
                  optionIndex += 1;
                  const index = optionIndex;
                  return (
                    <Link
                      aria-selected={index === active}
                      className={cn(
                        'search-result-row',
                        index === active && 'search-result-active',
                      )}
                      id={`${listboxId}-${result.key}`}
                      key={result.key}
                      onClick={(event) => {
                        event.preventDefault();
                        go(result.href);
                      }}
                      onMouseEnter={() => setActive(index)}
                      role="option"
                      to={result.href}
                    >
                      <SearchResultContent result={result} search={debounced} />
                    </Link>
                  );
                })}
              </div>
            ))
          )}
          {search.length >= 2 ? (
            <div className="global-search-footer">
              <button
                className="button-quiet min-h-9 text-xs"
                onClick={() => searchPage()}
                type="button"
              >
                <Search aria-hidden="true" size={15} />
                {query.data && enabled
                  ? `See all ${query.data.totalCount} result${query.data.totalCount === 1 ? '' : 's'}`
                  : 'Open full search'}
              </button>
              <button
                className="button-quiet min-h-9 text-xs"
                onClick={() => searchPage({ filters: true })}
                type="button"
              >
                <SlidersHorizontal aria-hidden="true" size={15} />
                Filters
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function GlobalSearch() {
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);

  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      const commandK = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
      const slash = event.key === '/' && !isTypingTarget(event.target);
      if (!commandK && !slash) return;
      event.preventDefault();
      if (window.matchMedia('(min-width: 768px)').matches) desktopInputRef.current?.focus();
      else setOverlayOpen(true);
    }
    document.addEventListener('keydown', onShortcut);
    return () => document.removeEventListener('keydown', onShortcut);
  }, []);

  return (
    <>
      <div className="hidden min-w-0 max-w-xl flex-1 md:block">
        <SearchBox inputRef={desktopInputRef} />
      </div>
      <button
        aria-label="Search everything"
        className="icon-button md:hidden"
        onClick={() => setOverlayOpen(true)}
        type="button"
      >
        <Search aria-hidden="true" size={20} />
      </button>
      {overlayOpen ? (
        <div aria-label="Search" aria-modal="true" className="global-search-overlay" role="dialog">
          <SearchBox onClose={() => setOverlayOpen(false)} overlay />
        </div>
      ) : null}
    </>
  );
}
