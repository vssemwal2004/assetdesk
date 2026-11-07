import type { IssueSummary } from '@assetdesk/contracts';

import { searchWords } from '../../lib/search-highlight';
import type { IssueMaterialScope } from './issue-grouping';

type MaterialDetail = IssueSummary['materialDetails'][number];

export interface IssueSearchHit {
  issue: IssueSummary;
  groupKey: string;
  field: string;
  value: string | null;
  path: string[];
}

interface Candidate {
  label: string;
  value: string | null | undefined;
  material?: MaterialDetail;
}

const IDENTIFIER_FIELDS = new Set(['Serial number', 'Asset tag']);

/** Same key the category folders use, so a hit can open its folder. */
export function issueGroupKey(trackingMode: string, category: string): string {
  return `${trackingMode}:${category.toLocaleUpperCase('en-US')}`;
}

export function domSafe(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, '-');
}

function matchCandidate(candidates: Candidate[], search: string): Candidate | null {
  const phrase = search.trim().toLocaleLowerCase('en-US');
  const words = searchWords(phrase);
  const present = candidates.filter((candidate) => candidate.value);
  return (
    present.find((candidate) => candidate.value?.toLocaleLowerCase('en-US').includes(phrase)) ??
    present.find((candidate) =>
      words.some((word) => candidate.value?.toLocaleLowerCase('en-US').includes(word)),
    ) ??
    null
  );
}

/**
 * Explains why each Issue matched a search and where it sits in the folder tree:
 * IT Asset › CPU › model › Issue ID › Serial number.
 */
export function issueSearchHits(
  issues: IssueSummary[],
  search: string,
  scope: Partial<IssueMaterialScope> = {},
): IssueSearchHit[] {
  if (!search.trim()) return [];
  return issues.map((issue) => {
    const inScope = issue.materialDetails.filter(
      (material) =>
        (!scope.trackingMode || material.trackingMode === scope.trackingMode) &&
        (!scope.category ||
          material.category.toLocaleUpperCase('en-US') ===
            scope.category.toLocaleUpperCase('en-US')),
    );
    const materials = inScope.length ? inScope : issue.materialDetails;
    const candidates: Candidate[] = [
      { label: 'Issue ID', value: issue.issueId },
      ...materials.flatMap((material) => [
        ...material.assets.flatMap((asset) => [
          { label: 'Serial number', value: asset.serialNumber, material },
          { label: 'Asset tag', value: asset.assetTag, material },
        ]),
        { label: 'Model', value: material.model, material },
        { label: 'Material', value: material.name, material },
        { label: 'Category', value: material.category, material },
      ]),
      { label: 'Receiver', value: issue.receiver.fullName },
      { label: 'Receiver code', value: issue.receiver.receiverCode },
      { label: 'University ID', value: issue.receiver.universityId },
      { label: 'Department', value: issue.receiver.department },
      { label: 'Contact', value: issue.receiver.contact },
      { label: 'Location', value: issue.destinationLocation },
      { label: 'Block', value: issue.destinationBlock },
      { label: 'Purpose', value: issue.purpose },
      { label: 'Issued by', value: issue.issuedBy.name },
    ];
    const match = matchCandidate(candidates, search);
    const material = match?.material ?? materials[0];
    const category = material?.category ?? 'Unassigned category';
    const trackingMode = material?.trackingMode ?? 'SERIALIZED';
    const identifier = match && IDENTIFIER_FIELDS.has(match.label) ? match : null;
    return {
      issue,
      groupKey: issueGroupKey(trackingMode, category),
      // Anything not visible in the summary matched through inventory configuration details.
      field: match?.label ?? 'Material configuration',
      value: match?.value ?? null,
      path: [
        trackingMode === 'QUANTITY' ? 'IT Consumable' : 'IT Asset',
        category,
        ...(material?.model && material.model !== category ? [material.model] : []),
        issue.issueId,
        ...(identifier ? [`${identifier.label} ${identifier.value}`] : []),
      ],
    };
  });
}
