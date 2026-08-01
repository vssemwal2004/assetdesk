import { Building2, IdCard, KeyRound, Mail, Phone, ShieldCheck, UserRound } from 'lucide-react';
import { Link } from 'react-router';

import { useAuth } from '../auth/auth-context';
import { AppCard, PageHeader } from '../components/ui';

export function ProfilePage() {
  const { user } = useAuth();
  if (!user) return null;

  const rows = [
    { label: 'Full name', value: user.name, icon: UserRound },
    { label: 'Employee ID', value: user.workerId, icon: IdCard },
    { label: 'Email', value: user.email, icon: Mail },
    { label: 'Contact', value: user.contact ?? 'Not provided', icon: Phone },
    { label: 'Department', value: user.department ?? 'Not provided', icon: Building2 },
    { label: 'Role', value: user.role === 'ADMIN' ? 'Admin' : 'Employee', icon: ShieldCheck },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Link className="button-secondary" to="/profile/change-password">
            <KeyRound aria-hidden="true" size={18} />
            Change password
          </Link>
        }
        description="Information attached to your signed-in account."
        title="My profile"
      />
      <AppCard className="max-w-3xl">
        <dl className="divide-y divide-[var(--color-border)]">
          {rows.map(({ label, value, icon: Icon }) => (
            <div
              className="grid gap-1 py-4 first:pt-0 last:pb-0 sm:grid-cols-[180px_1fr] sm:gap-4"
              key={label}
            >
              <dt className="flex items-center gap-2 text-sm font-bold text-[var(--color-text-muted)]">
                <Icon aria-hidden="true" className="text-[var(--color-primary)]" size={18} />
                {label}
              </dt>
              <dd className="break-words text-sm font-semibold text-[var(--color-text-strong)] sm:text-right">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </AppCard>
    </div>
  );
}
