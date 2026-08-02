import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { AppCard, ErrorSummary, LoadingPanel, PageHeader } from '../../components/ui';
import { getCartridge } from '../../lib/cartridges-api';
export function CartridgeDetailPage() {
  const { serialNumber = '' } = useParams();
  const query = useQuery({
    queryKey: ['cartridge', serialNumber],
    queryFn: () => getCartridge(serialNumber),
  });
  if (query.isPending) return <LoadingPanel />;
  if (query.isError || !query.data)
    return <ErrorSummary message="Cartridge details could not be loaded." />;
  const { cartridge, history } = query.data.data;
  return (
    <div className="space-y-6">
      <PageHeader
        title={cartridge.serialNumber}
        description={`${cartridge.model} · ${cartridge.colour}`}
        actions={
          <>
            <Link
              className="button-secondary"
              to={`/cartridges/issues/new?serial=${encodeURIComponent(cartridge.serialNumber)}`}
            >
              Issue
            </Link>
            <Link
              className="button-secondary"
              to={`/cartridges/returns/new?serial=${encodeURIComponent(cartridge.serialNumber)}`}
            >
              Return
            </Link>
          </>
        }
      />
      <AppCard className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Status" value={cartridge.status.replaceAll('_', ' ')} />
        <Info label="Location / holder" value={cartridge.currentHolderName ?? cartridge.location} />
        <Info label="Compatible printer" value={cartridge.compatiblePrinter ?? 'Not provided'} />
        <Info label="Refill count" value={String(cartridge.refillCount)} />
      </AppCard>
      <AppCard>
        <h2 className="font-extrabold text-[var(--color-primary-strong)]">Complete history</h2>
        <div className="mt-4 divide-y">
          {history.map((event) => (
            <div className="py-3" key={event._id}>
              <p className="font-bold">
                {event.type.replaceAll('_', ' ')} → {event.toStatus.replaceAll('_', ' ')}
              </p>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                {new Date(event.createdAt).toLocaleString('en-IN')} · {event.actorWorkerId}
              </p>
            </div>
          ))}
        </div>
      </AppCard>
    </div>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  );
}
