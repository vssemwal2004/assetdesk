import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { AppCard, ErrorSummary, LoadingPanel, PageHeader } from '../../components/ui';
import { getCartridgeDashboard } from '../../lib/cartridges-api';
const cards: Array<[string, string]> = [
  ['FILLED_AVAILABLE', 'Filled available'],
  ['ISSUED', 'Issued'],
  ['EMPTY', 'Empty'],
  ['DEFECTIVE', 'Defective'],
  ['WITH_VENDOR', 'With vendor'],
];
export function CartridgeDashboardPage() {
  const query = useQuery({ queryKey: ['cartridge-dashboard'], queryFn: getCartridgeDashboard });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Cartridge Dashboard"
        description="Issue, return, refill, and reissue cartridges through one simple workflow."
        actions={
          <Link className="button-secondary" to="/cartridges">
            View all cartridges
          </Link>
        }
      />
      <AppCard>
        <h2 className="text-lg font-extrabold text-[var(--color-primary-strong)]">
          Cartridge workflow
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Complete these steps in order. Each screen shows only cartridges valid for that action.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <WorkflowStep
            number="1"
            title="Issue filled"
            description="Give an available filled cartridge to an employee."
            to="/cartridges/issues/new"
          />
          <WorkflowStep
            number="2"
            title="Record return"
            description="Receive it back and mark it empty, unused, or damaged."
            to="/cartridges/returns/new"
          />
          <WorkflowStep
            number="3"
            title="Send for refill"
            description="Create Gate Pass Out for empty or defective cartridges."
            to="/cartridges/gate-passes/new"
          />
          <WorkflowStep
            number="4"
            title="Receive from vendor"
            description="Choose the final condition; refilled stock becomes issueable immediately."
            to="/cartridges/gate-in"
          />
        </div>
      </AppCard>
      {query.isPending ? (
        <LoadingPanel />
      ) : query.isError ? (
        <ErrorSummary message="Cartridge dashboard could not be loaded." />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map(([key, label]) => (
            <Link key={key} to={`/cartridges?status=${key}`}>
              <AppCard>
                <p className="text-xs font-bold text-[var(--color-text-muted)]">{label}</p>
                <p className="mt-2 text-2xl font-extrabold text-[var(--color-primary-strong)]">
                  {query.data?.data.counts[key] ?? 0}
                </p>
              </AppCard>
            </Link>
          ))}
          <Link to="/cartridges/gate-passes">
            <AppCard>
              <p className="text-xs font-bold text-[var(--color-text-muted)]">Open Gate Passes</p>
              <p className="mt-2 text-2xl font-extrabold text-[var(--color-primary-strong)]">
                {query.data?.data.openGatePasses ?? 0}
              </p>
            </AppCard>
          </Link>
        </div>
      )}
    </div>
  );
}

function WorkflowStep({
  number,
  title,
  description,
  to,
}: {
  number: string;
  title: string;
  description: string;
  to: string;
}) {
  return (
    <Link
      className="rounded-[12px] border border-[var(--color-border)] p-4 transition hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
      to={to}
    >
      <span className="grid size-8 place-items-center rounded-full bg-[var(--color-primary)] text-sm font-extrabold text-white">
        {number}
      </span>
      <span className="mt-3 block font-extrabold text-[var(--color-primary-strong)]">{title}</span>
      <span className="mt-1 block text-xs leading-5 text-[var(--color-text-muted)]">
        {description}
      </span>
    </Link>
  );
}
