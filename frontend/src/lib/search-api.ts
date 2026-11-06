import {
  GlobalSearchResponseSchema,
  SearchEntityTypeSchema,
  type GlobalSearchResponse,
  type SearchEntityType,
} from '@assetdesk/contracts';

import { apiRequest } from './api-client';

export interface GlobalSearchFilters {
  q?: string;
  types?: SearchEntityType[];
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  category?: string;
  location?: string;
  block?: string;
  trackingMode?: 'SERIALIZED' | 'QUANTITY';
  status?: string;
}

export type GlobalSearchData = GlobalSearchResponse['data'];

export const SEARCH_FILTER_PARAMS = [
  'dateFrom',
  'dateTo',
  'category',
  'location',
  'block',
  'trackingMode',
  'status',
] as const;

export function hasSearchCriteria(filters: GlobalSearchFilters): boolean {
  return (
    (filters.q?.trim().length ?? 0) >= 2 ||
    SEARCH_FILTER_PARAMS.some((key) => Boolean(filters[key]))
  );
}

/** Reads search state from URL parameters, ignoring unknown record types. */
export function searchFiltersFromParams(parameters: URLSearchParams): GlobalSearchFilters {
  const types = parameters
    .getAll('type')
    .filter((value): value is SearchEntityType =>
      SearchEntityTypeSchema.options.includes(value as SearchEntityType),
    );
  const trackingMode = parameters.get('trackingMode');
  const text = (key: string) => parameters.get(key)?.trim() || undefined;
  const filters: GlobalSearchFilters = {};
  const q = text('q');
  if (q) filters.q = q;
  if (types.length) filters.types = types;
  for (const key of ['dateFrom', 'dateTo', 'category', 'location', 'block', 'status'] as const) {
    const value = text(key);
    if (value) filters[key] = value;
  }
  if (trackingMode === 'SERIALIZED' || trackingMode === 'QUANTITY') {
    filters.trackingMode = trackingMode;
  }
  return filters;
}

export async function globalSearch(
  filters: GlobalSearchFilters,
  signal?: AbortSignal,
): Promise<GlobalSearchData> {
  const parameters = new URLSearchParams();
  if (filters.q?.trim()) parameters.set('q', filters.q.trim());
  if (filters.types?.length) parameters.set('types', filters.types.join(','));
  if (filters.limit) parameters.set('limit', String(filters.limit));
  for (const key of SEARCH_FILTER_PARAMS) {
    const value = filters[key];
    if (value) parameters.set(key, value);
  }
  const payload = await apiRequest<unknown>(`/api/v1/search?${parameters.toString()}`, {
    ...(signal ? { signal } : {}),
  });
  return GlobalSearchResponseSchema.parse(payload).data;
}
