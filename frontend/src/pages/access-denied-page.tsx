import { ShieldX } from 'lucide-react';
import { Link } from 'react-router';

import { AppCard, PageHeader } from '../components/ui';

export function AccessDeniedPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Access denied" />
      <AppCard className="max-w-xl text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-[var(--color-danger-soft)] text-[var(--color-danger)]">
          <ShieldX aria-hidden="true" size={24} />
        </span>
        <h2 className="mt-4 text-lg font-extrabold text-[var(--color-primary-strong)]">
          You do not have access to this page
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
          Your AssetDesk role does not permit this action.
        </p>
        <Link className="button-primary mt-5" to="/dashboard">
          Return to dashboard
        </Link>
      </AppCard>
    </div>
  );
}
