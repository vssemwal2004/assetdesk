import { MapPin } from 'lucide-react';
import { useState } from 'react';

import { HighlightText } from '../lib/search-highlight';
import { SearchPath } from './global-search';

export interface SearchHitSummary {
  path: string[];
  field: string;
  value: string | null;
}

/** Lists where an in-page search matched, with the folder path and a jump-to button. */
export function SearchHitsPanel<T extends SearchHitSummary>({
  hits,
  noun,
  search,
  onReveal,
}: {
  hits: T[];
  noun: string;
  search: string;
  onReveal: (hit: T) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? hits : hits.slice(0, 5);
  return (
    <section aria-label="Where the search matched" className="search-hit-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-extrabold text-[#7a3205]">
          <MapPin aria-hidden="true" className="shrink-0" size={17} />
          {hits.length} {hits.length === 1 ? noun : `${noun}s`} found for “{search}” — folders
          holding matches are open
        </p>
        {hits.length > 5 ? (
          <button
            className="text-xs font-extrabold text-[var(--color-primary)] hover:underline"
            onClick={() => setExpanded((current) => !current)}
            type="button"
          >
            {expanded ? 'Show fewer' : `Show all ${hits.length}`}
          </button>
        ) : null}
      </div>
      <ul className="mt-2 space-y-1.5">
        {visible.map((hit, index) => (
          <li className="search-hit-row" key={`${hit.path.join('/')}:${index}`}>
            <div className="min-w-0 flex-1">
              <SearchPath path={hit.path} />
              <span className="search-match-chip">
                {hit.value ? (
                  <>
                    {hit.field}: <HighlightText search={search} text={hit.value} />
                  </>
                ) : (
                  `Matched by ${hit.field.toLowerCase()}`
                )}
              </span>
            </div>
            <button
              className="button-secondary min-h-9 px-3 text-xs"
              onClick={() => onReveal(hit)}
              type="button"
            >
              Show
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
