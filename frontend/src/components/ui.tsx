import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Inbox,
  LoaderCircle,
  RefreshCw,
  Search,
} from 'lucide-react';
import {
  forwardRef,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  loading?: boolean;
}

export function Button({
  children,
  className,
  variant = 'primary',
  loading = false,
  disabled,
  ...props
}: ButtonProps) {
  const variants = {
    primary: 'button-primary',
    secondary: 'button-secondary',
    quiet: 'button-quiet',
    danger: 'button-danger',
  } as const;

  return (
    <button className={cn(variants[variant], className)} disabled={disabled || loading} {...props}>
      {loading ? <LoaderCircle aria-hidden="true" className="animate-spin" size={18} /> : null}
      {children}
    </button>
  );
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  optional?: boolean;
}

export const TextField = forwardRef<HTMLInputElement, FieldProps>(function TextField(
  { label, error, hint, optional = false, className, id: suppliedId, ...props },
  ref,
) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const messageId = `${id}-message`;

  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="field-label" htmlFor={id}>
        {label}
        {optional ? (
          <span className="font-medium text-[var(--color-text-muted)]"> (optional)</span>
        ) : null}
      </label>
      <input
        aria-describedby={error || hint ? messageId : undefined}
        aria-invalid={Boolean(error)}
        className={cn('field-input', error && 'field-input-error')}
        id={id}
        ref={ref}
        {...props}
      />
      {error ? (
        <p className="flex items-start gap-1.5 text-sm text-[var(--color-danger)]" id={messageId}>
          <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={16} />
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs leading-5 text-[var(--color-text-muted)]" id={messageId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export const PasswordField = forwardRef<HTMLInputElement, FieldProps>(function PasswordField(
  { label, error, hint, className, id: suppliedId, ...props },
  ref,
) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const messageId = `${id}-message`;

  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          aria-describedby={error || hint ? messageId : undefined}
          aria-invalid={Boolean(error)}
          className={cn('field-input pr-12', error && 'field-input-error')}
          id={id}
          ref={ref}
          type={visible ? 'text' : 'password'}
          {...props}
        />
        <button
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-[10px] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--color-focus)]"
          onClick={() => setVisible((current) => !current)}
          type="button"
        >
          {visible ? <EyeOff aria-hidden="true" size={19} /> : <Eye aria-hidden="true" size={19} />}
        </button>
      </div>
      {error ? (
        <p className="flex items-start gap-1.5 text-sm text-[var(--color-danger)]" id={messageId}>
          <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={16} />
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs leading-5 text-[var(--color-text-muted)]" id={messageId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--color-primary)] text-lg font-extrabold text-white shadow-sm">
        A
      </span>
      {!compact ? (
        <span>
          <span className="block text-lg font-extrabold leading-5 text-[var(--color-primary-strong)]">
            AssetDesk
          </span>
          <span className="block text-xs font-semibold text-[var(--color-text-muted)]">
            University materials
          </span>
        </span>
      ) : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-[22px] font-extrabold leading-7 text-[var(--color-primary-strong)] sm:text-2xl sm:leading-8">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function SearchForm({
  id,
  label,
  placeholder,
  value,
  onSearch,
  className,
  inputClassName,
  error,
  autoComplete,
  transform,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onSearch: (value: string) => void;
  className?: string;
  inputClassName?: string;
  error?: string | null;
  autoComplete?: string;
  transform?: (value: string) => string;
}) {
  const [draft, setDraft] = useState(value);
  const errorId = `${id}-error`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = transform ? transform(draft.trim()) : draft.trim();
    setDraft(next);
    onSearch(next);
  }

  return (
    <form
      className={cn('grid w-full gap-2 sm:grid-cols-[minmax(0,1fr)_auto]', className)}
      onSubmit={submit}
      role="search"
    >
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
          size={18}
        />
        <input
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          autoComplete={autoComplete}
          className={cn('field-input field-input-search', error && 'field-input-error', inputClassName)}
          id={id}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
          value={draft}
        />
      </div>
      <button className="button-secondary w-full sm:w-auto" type="submit">
        <Search aria-hidden="true" size={17} />
        Search
      </button>
      {error ? (
        <p
          className="text-sm font-semibold text-[var(--color-danger)] sm:col-span-2"
          id={errorId}
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function AppCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        'rounded-[14px] border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-card)] sm:p-5',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function ErrorSummary({
  title = 'Check the form',
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <div
      className="rounded-[12px] border border-red-200 bg-[var(--color-danger-soft)] p-4"
      role="alert"
      tabIndex={-1}
    >
      <div className="flex gap-3">
        <AlertCircle
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-[var(--color-danger)]"
          size={20}
        />
        <div>
          <p className="font-bold text-[var(--color-danger)]">{title}</p>
          <p className="mt-1 text-sm leading-5 text-red-900">{message}</p>
        </div>
      </div>
    </div>
  );
}

export function LoadingPanel({ label = 'Loading' }: { label?: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="space-y-3" role="status">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((item) => (
        <div className="rounded-[14px] border border-[var(--color-border)] bg-white p-4" key={item}>
          <div className="skeleton h-4 w-24 rounded" />
          <div className="skeleton mt-3 h-5 w-2/3 rounded" />
          <div className="skeleton mt-2 h-4 w-1/2 rounded" />
        </div>
      ))}
    </div>
  );
}

export function ErrorState({
  title = 'Could not load this information',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-[14px] border border-red-200 bg-white p-6 text-center" role="alert">
      <span className="mx-auto grid size-11 place-items-center rounded-xl bg-red-50 text-[var(--color-danger)]">
        <AlertCircle aria-hidden="true" size={22} />
      </span>
      <h2 className="mt-3 font-bold text-[var(--color-primary-strong)]">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-[var(--color-text-muted)]">
        {message}
      </p>
      {onRetry ? (
        <Button className="mt-4" onClick={onRetry} variant="secondary">
          <RefreshCw aria-hidden="true" size={18} />
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[14px] border border-dashed border-[var(--color-primary-border)] bg-white px-5 py-10 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
        <Inbox aria-hidden="true" size={24} />
      </span>
      <h2 className="mt-3 font-bold text-[var(--color-primary-strong)]">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-[var(--color-text-muted)]">
        {message}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function SuccessMark({ label = 'Success' }: { label?: string }) {
  return (
    <span
      aria-label={label}
      className="grid size-12 place-items-center rounded-xl bg-[var(--color-success-soft)] text-[var(--color-success)]"
      role="img"
    >
      <CheckCircle2 aria-hidden="true" size={26} />
    </span>
  );
}

export function WorkerStatusBadge({ status }: { status: 'INVITED' | 'ACTIVE' | 'DISABLED' }) {
  const classes = {
    INVITED: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
    ACTIVE: 'bg-[var(--color-success-soft)] text-[var(--color-success)]',
    DISABLED: 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
  } as const;
  const labels = { INVITED: 'Invited', ACTIVE: 'Active', DISABLED: 'Disabled' } as const;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold',
        classes[status],
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {labels[status]}
    </span>
  );
}
