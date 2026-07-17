import {
  IssueReportResponseSchema,
  type IssueReportFilters,
  type IssueReportResponse,
} from '@assetdesk/contracts';

import { apiBlobRequest, apiRequest } from './api-client';

export async function getIssueReport(
  filters: IssueReportFilters,
  page: number,
  signal?: AbortSignal,
): Promise<IssueReportResponse> {
  const query = new URLSearchParams({
    issuedFrom: filters.issuedFrom,
    issuedThrough: filters.issuedThrough,
    page: String(page),
    pageSize: '20',
  });
  if (filters.status) query.set('status', filters.status);
  if (filters.returnState) query.set('returnState', filters.returnState);
  if (filters.receiverType) query.set('receiverType', filters.receiverType);
  if (filters.search) query.set('search', filters.search);
  return IssueReportResponseSchema.parse(
    await apiRequest<unknown>(`/api/v1/reports/issue-register?${query.toString()}`, {
      ...(signal ? { signal } : {}),
    }),
  );
}

export async function exportIssueReport(filters: IssueReportFilters): Promise<Blob> {
  return apiBlobRequest('/api/v1/reports/issue-register/export', {
    method: 'POST',
    json: { format: 'CSV', filters },
  });
}
