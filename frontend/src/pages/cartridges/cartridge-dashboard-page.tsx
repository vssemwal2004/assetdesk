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
  ['QC_PENDING', 'QC pending'],
];
export function CartridgeDashboardPage() {
  const query = useQuery({ queryKey: ['cartridge-dashboard'], queryFn: getCartridgeDashboard });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Cartridge Dashboard"
        description="A focused operational overview of cartridge stock, custody, Gate Passes, and pending work."
        actions={
          <Link className="button-secondary" to="/cartridges">
            View all cartridges
          </Link>
        }
      />
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
