import { useQuery } from '@tanstack/react-query';
import { Activity, CalendarDays, CheckCircle2, Clock3, Filter, UsersRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AppCard, Button, ErrorState, LoadingPanel, PageHeader } from '../../components/ui';
import { isApiError } from '../../lib/api-client';
import { getAuditEvents } from '../../lib/audit-api';
import { getWorkers } from '../../lib/workers-api';

const indiaDate = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
const today = indiaDate(new Date());
const startDate = indiaDate(new Date(Date.now() - 13 * 86400000));
const formatDate = (value: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(value));

export function ActivityPage() {
  const [employee, setEmployee] = useState('');
  const [result, setResult] = useState('');
  const [hour, setHour] = useState<number | null>(null);
  const workersQuery = useQuery({ queryKey: ['activity-workers'], queryFn: ({ signal }) => getWorkers({ page: 1, pageSize: 100, status: 'ACTIVE' }, signal) });
  const query = useQuery({
    queryKey: ['activity', employee, result],
    queryFn: async ({ signal }) => {
      // Use the established search parameter so this page also works while an
      // older backend instance is still running. The final client-side check
      // keeps the employee filter exact.
      const filters = { page: 1, pageSize: 100, from: startDate, to: today, ...(employee ? { search: employee } : {}), ...(result ? { result: result as 'SUCCESS' | 'DENIED' | 'FAILED' } : {}) };
      const first = await getAuditEvents(filters, signal);
      const all = [...first.data];
      for (let page = 2; page <= first.meta.totalPages; page++) all.push(...(await getAuditEvents({ ...filters, page }, signal)).data);
      return employee ? all.filter(event => event.actorWorkerId === employee) : all;
    },
  });
  const events = query.data ?? [];
  const hourOf = (date: string) => Number(new Date(date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }));
  const counts = useMemo(() => Array.from({ length: 24 }, (_, h) => events.filter(e => hourOf(e.timestampUtc) === h).length), [events]);
  const selected = hour === null ? events : events.filter(e => hourOf(e.timestampUtc) === hour);
  const max = Math.max(1, ...counts);
  const workers = workersQuery.data?.data ?? [];
  const filtered = Boolean(employee || result || hour !== null);
  const clear = () => { setEmployee(''); setResult(''); setHour(null); };

  return <div className="space-y-6">
    <PageHeader description="Review employee and administrator actions from the last 14 days." title="Activity & audit trail" />
    <section className="rounded-[16px] border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Filter className="text-[var(--color-primary)]" size={18} /><h2 className="font-extrabold">Filter activity</h2></div><span className="rounded-full bg-[var(--color-success-soft)] px-3 py-1 text-xs font-bold text-[var(--color-success)]"><CheckCircle2 className="mr-1 inline" size={14} />14-day retention</span></div>
      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(220px,1fr)_200px_auto]"><label><span className="field-label">Employee</span><span className="flex"><span aria-hidden="true" className="grid min-h-10 w-11 shrink-0 place-items-center rounded-l-[9px] border border-r-0 border-[var(--color-border)] bg-[var(--color-surface-tint)] text-[var(--color-text-muted)]"><UsersRound size={16} /></span><select className="field-input min-w-0 w-full rounded-l-none" onChange={e => { setEmployee(e.target.value); setHour(null); }} value={employee}><option value="">All employees</option>{workers.map(worker => <option key={worker.workerId} value={worker.workerId}>{worker.name} · {worker.workerId}</option>)}</select></span></label><label><span className="field-label">Result</span><select className="field-input w-full" onChange={e => setResult(e.target.value)} value={result}><option value="">All results</option><option value="SUCCESS">Success</option><option value="DENIED">Denied</option><option value="FAILED">Failed</option></select></label>{filtered ? <Button onClick={clear} type="button" variant="quiet">Clear filters</Button> : <div />}</div>
      <p className="mt-3 text-xs font-semibold text-[var(--color-text-muted)]"><CalendarDays className="mr-1 inline" size={14} />Showing {startDate} to {today} · {events.length} {events.length === 1 ? 'event' : 'events'}</p>
    </section>
    {query.isPending ? <LoadingPanel label="Loading activity" /> : query.isError ? <ErrorState message={isApiError(query.error) ? query.error.message : 'Activity could not be loaded. Check that the backend is running and try again.'} onRetry={() => void query.refetch()} /> : <>
      <AppCard><div className="flex items-center gap-2"><Activity className="text-[var(--color-primary)]" size={19} /><div><h2 className="font-extrabold">Activity pulse</h2><p className="text-xs text-[var(--color-text-muted)]">Select an hour to focus the timeline.</p></div></div><div className="mt-6 flex h-48 items-end gap-1 border-b border-l border-[var(--color-border)] px-2">{counts.map((count, index) => <button aria-label={`${index}:00, ${count} events`} className={`group flex flex-1 flex-col justify-end ${hour === index ? 'bg-[var(--color-primary-soft)]' : ''}`} key={index} onClick={() => setHour(hour === index ? null : index)}><span className="mx-auto block w-full max-w-7 rounded-t bg-[var(--color-primary)]" style={{ height: `${Math.max(count ? 8 : 2, count / max * 150)}px` }} /></button>)}</div><div className="mt-2 flex justify-between text-[10px] text-[var(--color-text-muted)]"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div></AppCard>
      <AppCard><div className="flex items-center gap-2"><Clock3 className="text-[var(--color-primary)]" size={18} /><h2 className="font-extrabold">{hour === null ? 'Recent activity' : `Activity at ${String(hour).padStart(2, '0')}:00`}</h2></div><div className="mt-4 divide-y divide-[var(--color-border)]">{selected.length === 0 ? <p className="py-10 text-center text-sm text-[var(--color-text-muted)]">No activity matches these filters.</p> : selected.map(event => <div className="py-4" key={event.id}><div className="flex flex-wrap justify-between gap-2"><strong className="text-sm capitalize">{event.action.replaceAll('_', ' ')}</strong><span className="text-xs text-[var(--color-text-muted)]">{formatDate(event.timestampUtc)}</span></div><p className="mt-1 text-sm">{event.actorWorkerId ?? 'System'} · {event.targetType}{event.targetId ? ` · ${event.targetId}` : ''}</p><p className="mt-1 text-xs text-[var(--color-text-muted)]">Result: {event.result}{event.reasonCode ? ` · ${event.reasonCode}` : ''}</p>{event.metadata ? <details className="mt-2 text-xs"><summary className="cursor-pointer font-bold">View what changed</summary><pre className="mt-2 overflow-auto rounded bg-[var(--color-surface-tint)] p-2">{JSON.stringify(event.metadata, null, 2)}</pre></details> : null}</div>)}</div></AppCard>
    </>}
  </div>;
}
