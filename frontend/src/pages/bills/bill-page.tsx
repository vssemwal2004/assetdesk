import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download } from 'lucide-react';
import { Link, useParams } from 'react-router';

import { Button, ErrorState, LoadingPanel } from '../../components/ui';
import { getIssue } from '../../lib/issues-api';
import { BillDocument } from './bill-document';

export function BillPage() {
  const { issueId = '' } = useParams();
  const parameters = new URLSearchParams(window.location.search);
  const billType = parameters.get('type') === 'return' ? 'return' : 'issue';
  const returnEventId = parameters.get('returnEventId');
  const query = useQuery({
    queryKey: ['bill', issueId],
    queryFn: ({ signal }) => getIssue(issueId, signal),
    enabled: Boolean(issueId),
  });

  if (query.isPending) return <LoadingPanel label="Loading issue/return slip" />;
  if (query.isError || !query.data) {
    return (
      <ErrorState
        message="This issue/return slip could not be generated from the Issue Record."
        onRetry={() => void query.refetch()}
        title="Issue/return slip not available"
      />
    );
  }

  const issue = query.data.data.issue;
  const returnEvent =
    billType === 'return' && 'returnEvents' in issue
      ? issue.returnEvents.find((event) => event.returnEventId === returnEventId)
      : null;

  if (billType === 'return' && !returnEvent) {
    return (
      <ErrorState
        message="This return slip could not be generated because the selected Return event was not found."
        onRetry={() => void query.refetch()}
        title="Return slip not available"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-end gap-2 print:hidden">
        <Link className="button-quiet" to="/bills">
          <ArrowLeft aria-hidden="true" size={18} />
          Back to Issue/Return Slip
        </Link>
        <Button onClick={() => window.print()}>
          <Download aria-hidden="true" size={18} />
          Print / Save PDF
        </Button>
      </div>

      <BillDocument issue={issue} {...(returnEvent ? { returnEvent } : {})} />
    </div>
  );
}
