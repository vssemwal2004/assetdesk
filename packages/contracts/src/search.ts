import { z } from 'zod';

export const SearchEntityTypeSchema = z.enum([
  'ISSUE',
  'MATERIAL',
  'ASSET_UNIT',
  'CARTRIDGE',
  'CARTRIDGE_GATE_PASS',
  'GATE_PASS',
  'RECEIVER',
  'EMPLOYEE',
]);

export const SEARCH_ENTITY_LABELS: Record<z.infer<typeof SearchEntityTypeSchema>, string> = {
  ISSUE: 'Issue Records',
  MATERIAL: 'Inventory',
  ASSET_UNIT: 'Serial numbers',
  CARTRIDGE: 'Cartridges',
  CARTRIDGE_GATE_PASS: 'Cartridge gate passes',
  GATE_PASS: 'Inventory gate passes',
  RECEIVER: 'Receivers',
  EMPLOYEE: 'Employees',
};

/** Filters a record type must support for it to stay in a filtered search. */
export type SearchFilterKey = 'category' | 'trackingMode' | 'location' | 'block';

export const SEARCH_FILTER_SUPPORT: Record<
  SearchFilterKey,
  Array<z.infer<typeof SearchEntityTypeSchema>>
> = {
  category: ['ISSUE', 'MATERIAL', 'ASSET_UNIT', 'GATE_PASS'],
  trackingMode: ['ISSUE', 'MATERIAL', 'ASSET_UNIT', 'GATE_PASS'],
  location: ['ISSUE', 'MATERIAL', 'ASSET_UNIT', 'CARTRIDGE'],
  block: ['ISSUE', 'MATERIAL', 'ASSET_UNIT'],
};

/** Status values each record type accepts; a status filter hides types that lack it. */
export const SEARCH_STATUS_OPTIONS: Partial<
  Record<z.infer<typeof SearchEntityTypeSchema>, string[]>
> = {
  ISSUE: ['ISSUED', 'PARTIALLY_RETURNED', 'RETURNED', 'DAMAGED', 'LOST', 'CANCELLED'],
  MATERIAL: ['ACTIVE', 'UNDER_MAINTENANCE', 'SCRAP', 'NOT_IN_USE', 'ARCHIVED'],
  ASSET_UNIT: [
    'AVAILABLE',
    'ISSUED',
    'OUTSIDE',
    'RETURNED',
    'UNDER_REPAIR',
    'DAMAGED',
    'LOST',
    'SCRAPPED',
  ],
  CARTRIDGE: [
    'FILLED_AVAILABLE',
    'ISSUED',
    'EMPTY',
    'DEFECTIVE',
    'READY_FOR_GATE_OUT',
    'WITH_VENDOR',
    'QC_PENDING',
    'REFILL_FAILED',
    'DAMAGED',
    'SCRAP_PENDING',
    'SCRAPPED',
  ],
  CARTRIDGE_GATE_PASS: [
    'DRAFT',
    'AWAITING_VERIFICATION',
    'VERIFIED',
    'GATE_OUT',
    'PARTIALLY_RETURNED',
    'QC_PENDING',
    'CLOSED',
    'CANCELLED',
  ],
  GATE_PASS: [
    'READY_FOR_OUT',
    'OUTSIDE',
    'PARTIALLY_IN',
    'GATE_IN_COMPLETED',
    'CLOSED_NON_RETURNABLE',
    'CANCELLED',
  ],
  RECEIVER: ['ACTIVE', 'INACTIVE'],
  EMPLOYEE: ['INVITED', 'ACTIVE', 'DISABLED'],
};

const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');
const OptionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).max(max).optional(),
  );

export const GlobalSearchQuerySchema = z
  .object({
    q: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string().trim().min(2).max(120).optional(),
    ),
    types: z.preprocess(
      (value) =>
        typeof value === 'string'
          ? value.split(',').filter(Boolean)
          : Array.isArray(value)
            ? value
            : undefined,
      z.array(SearchEntityTypeSchema).max(8).optional(),
    ),
    limit: z.coerce.number().int().min(1).max(100).default(5),
    dateFrom: z.preprocess((value) => (value === '' ? undefined : value), IsoDateSchema.optional()),
    dateTo: z.preprocess((value) => (value === '' ? undefined : value), IsoDateSchema.optional()),
    category: OptionalText(120),
    location: OptionalText(120),
    block: OptionalText(120),
    trackingMode: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.enum(['SERIALIZED', 'QUANTITY']).optional(),
    ),
    status: OptionalText(40),
  })
  .strict()
  .refine(
    (value) =>
      Boolean(
        value.q ||
        value.dateFrom ||
        value.dateTo ||
        value.category ||
        value.location ||
        value.block ||
        value.trackingMode ||
        value.status,
      ),
    { message: 'Enter at least 2 characters or apply a filter.', path: ['q'] },
  )
  .refine((value) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo, {
    message: 'The start date must be on or before the end date.',
    path: ['dateTo'],
  });

export const SearchResultSchema = z
  .object({
    type: SearchEntityTypeSchema,
    key: z.string().min(1),
    title: z.string().min(1),
    subtitle: z.string().nullable(),
    status: z.string().nullable(),
    matchedField: z.string().nullable(),
    matchedValue: z.string().nullable(),
    path: z.array(z.string()),
    href: z.string().regex(/^\/(?!\/)/),
    occurredAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();

export const SearchGroupSchema = z
  .object({
    type: SearchEntityTypeSchema,
    label: z.string().min(1),
    total: z.number().int().nonnegative(),
    results: z.array(SearchResultSchema),
  })
  .strict();

export const GlobalSearchResponseSchema = z
  .object({
    data: z
      .object({
        query: z.string(),
        groups: z.array(SearchGroupSchema),
        totalCount: z.number().int().nonnegative(),
        excludedTypes: z.array(SearchEntityTypeSchema),
        generatedAt: z.string().datetime({ offset: true }),
      })
      .strict(),
  })
  .strict();

export type SearchEntityType = z.infer<typeof SearchEntityTypeSchema>;
export type GlobalSearchQuery = z.infer<typeof GlobalSearchQuerySchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type SearchGroup = z.infer<typeof SearchGroupSchema>;
export type GlobalSearchResponse = z.infer<typeof GlobalSearchResponseSchema>;
