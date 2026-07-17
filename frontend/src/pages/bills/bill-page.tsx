import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { Link, useParams } from 'react-router';

import { Button, ErrorState, LoadingPanel, PageHeader } from '../../components/ui';
import { getIssue } from '../../lib/issues-api';
import { BillDocument } from './bill-document';

export function BillPage() {
  const { issueId = '' } = useParams();
  const query = useQuery({
    queryKey: ['bill', issueId],
    queryFn: ({ signal }) => getIssue(issueId, signal),
    enabled: Boolean(issueId),
  });

  if (query.isPending) return <LoadingPanel label="Loading bill" />;
  if (query.isError || !query.data) {
    return (
      <ErrorState
        message="This bill could not be generated from the Issue Record."
        onRetry={() => void query.refetch()}
        title="Bill not available"
      />
    );
  }

  const issue = query.data.data.issue;

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <>
            <Link className="button-quiet print:hidden" to="/bills">
              <ArrowLeft aria-hidden="true" size={18} />
              Back to Bills
            </Link>
            <Button className="print:hidden" onClick={() => window.print()}>
              <Printer aria-hidden="true" size={18} />
              Print bill
            </Button>
          </>
        }
        description="Black and white printable material issue bill."
        title={`Bill ${issue.issueId}`}
      />

      <BillDocument issue={issue} />
    </div>
  );
}
