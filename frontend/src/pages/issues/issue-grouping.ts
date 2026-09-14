import type { IssueSummary } from '@assetdesk/contracts';

export interface IssueCategoryGroup {
  category: string;
  trackingMode: 'SERIALIZED' | 'QUANTITY';
  issues: IssueSummary[];
  issueQuantity: number;
  outstanding: number;
  totalQuantity: number;
  availableQuantity: number;
  issuedQuantity: number;
}

export interface IssueMaterialScope {
  category: string;
  trackingMode: 'SERIALIZED' | 'QUANTITY';
}

function sameCategory(left: string, right: string): boolean {
  return left.trim().localeCompare(right.trim(), 'en-US', { sensitivity: 'accent' }) === 0;
}

export function scopedMaterialDetails(issue: IssueSummary, scope: IssueMaterialScope) {
  return issue.materialDetails.filter(
    (material) =>
      material.trackingMode === scope.trackingMode &&
      sameCategory(material.category, scope.category),
  );
}

export function groupIssues(
  issues: IssueSummary[],
  filter: Partial<IssueMaterialScope> = {},
): IssueCategoryGroup[] {
  const groups = new Map<string, IssueCategoryGroup>();
  for (const issue of issues) {
    for (const materialGroup of issue.materialGroups) {
      const { category, trackingMode } = materialGroup;
      if (filter.trackingMode && trackingMode !== filter.trackingMode) continue;
      if (filter.category && !sameCategory(category, filter.category)) continue;
      const key = `${trackingMode}:${category.toLocaleUpperCase('en-US')}`;
      const group = groups.get(key) ?? {
        category,
        trackingMode,
        issues: [],
        issueQuantity: 0,
        outstanding: 0,
        totalQuantity: 0,
        availableQuantity: 0,
        issuedQuantity: 0,
      };
      group.issues.push(issue);
      group.issueQuantity += scopedMaterialDetails(issue, { category, trackingMode }).reduce(
        (total, material) => total + material.issuedQuantity,
        0,
      );
      group.outstanding += materialGroup.outstandingQuantity;
      groups.set(key, group);
    }
  }
  return [...groups.values()].sort((left, right) => left.category.localeCompare(right.category));
}
