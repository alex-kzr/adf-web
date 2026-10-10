import {
  type ComponentPropsWithoutRef,
  cloneElement,
  type ReactElement,
  type ReactNode,
  startTransition,
  useActionState,
  useEffect,
  useId,
  useRef,
} from 'react';
import { errorMessage } from './api';
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    projects: <path d="M3 7h7l2 2h9v11H3V7Zm0 0V4h7l2 3" />,
    tasks: (
      <>
        <path d="m3 6 2 2 4-4m-6 12 2 2 4-4M13 6h8M13 16h8" />
      </>
    ),
    workflows: (
      <>
        <rect x="9" y="2" width="6" height="5" rx="1" />
        <rect x="2" y="17" width="6" height="5" rx="1" />
        <rect x="16" y="17" width="6" height="5" rx="1" />
        <path d="M12 7v5H5v5m7-5h7v5" />
      </>
    ),
    agents: (
      <>
        <rect x="4" y="6" width="16" height="14" rx="4" />
        <path d="M12 2v4M8 12h.1M16 12h.1M8 16h8M1 10v6m22-6v6" />
      </>
    ),
    registry: (
      <>
        <path d="m12 2 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5" />
      </>
    ),
    runs: (
      <>
        <path d="m9 5 11 7-11 7V5Z" />
        <path d="M3 5v14" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="m10 2-.5 3-3 1L4 4 2 7l2.5 2-.5 3-3 1 1 4 3-.5 2 2-.5 3 4 1 1-3 3-.5 2.5 2 3-3-2-2.5.5-3 3-1-1-4-3 .5-2-2 .5-3-4-1Z" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    refresh: (
      <>
        <path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7" />
      </>
    ),
    lock: (
      <>
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V6a4 4 0 0 1 8 0v4" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    warning: (
      <>
        <path d="m12 3 10 18H2L12 3Z" />
        <path d="M12 9v5m0 3h.1" />
      </>
    ),
    branch: (
      <>
        <circle cx="6" cy="5" r="2" />
        <circle cx="6" cy="19" r="2" />
        <circle cx="18" cy="5" r="2" />
        <path d="M6 7v10m0-5h6a6 6 0 0 0 6-5" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.dashboard}
    </svg>
  );
}
export function Button({
  children,
  variant = 'secondary',
  ...props
}: ComponentPropsWithoutRef<'button'> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
}) {
  return (
    <button type="button" className={`button ${variant}`} {...props}>
      {children}
    </button>
  );
}
export function Badge({ value }: { value?: string | null }) {
  return (
    <span className={`badge status-${value ?? 'unknown'}`}>
      {(value ?? 'unknown').replaceAll('_', ' ')}
    </span>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-title">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name="plus" size={24} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function ErrorNotice({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="notice error" role="alert">
      <Icon name="warning" />
      <div>
        <strong>Request needs attention</strong>
        <p>{errorMessage(error)}</p>
        {retry && <Button onClick={retry}>Try again</Button>}
      </div>
    </div>
  );
}
export function QueryState({
  pending,
  error,
  retry,
  children,
}: {
  pending: boolean;
  error: unknown;
  retry?: () => void;
  children: ReactNode;
}) {
  if (pending)
    return (
      <div className="loading" role="status">
        <span className="spinner" />
        Loading current data…
      </div>
    );
  if (error) return <ErrorNotice error={error} retry={retry} />;
  return <>{children}</>;
}
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children as ReactElement<{ id?: string; 'aria-describedby'?: string }>, {
        id,
        'aria-describedby': hint ? `${id}-hint` : undefined,
      })}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function Modal({
  title,
  description,
  close,
  children,
}: {
  title: string;
  description?: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      className="modal"
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header>
        <div>
          <h2 id={titleId}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <Button variant="ghost" onClick={close} aria-label="Close dialog">
          <Icon name="close" />
        </Button>
      </header>
      {children}
    </dialog>
  );
}
export function ActionForm({
  submit,
  children,
  label = 'Save',
  cancel,
  disabled = false,
}: {
  submit: (data: FormData) => Promise<void>;
  children: ReactNode;
  label?: string;
  cancel?: () => void;
  disabled?: boolean;
}) {
  const [error, action, pending] = useActionState(async (_: string, data: FormData) => {
    try {
      await submit(data);
      return '';
    } catch (cause) {
      return errorMessage(cause);
    }
  }, '');
  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <fieldset disabled={pending || disabled}>{children}</fieldset>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      <footer className="form-actions">
        {cancel && <Button onClick={cancel}>Cancel</Button>}
        <Button type="submit" variant="primary" disabled={pending || disabled}>
          {pending ? 'Saving…' : label}
        </Button>
      </footer>
    </form>
  );
}
export const text = (data: FormData, key: string): string => String(data.get(key) ?? '').trim();
export function Selection({
  options,
  value,
  onChange,
  label,
  empty = 'Select…',
}: {
  options: { id: string; name: string }[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  empty?: string;
}) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{empty}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function JsonView({ value }: { value: unknown }) {
  return <pre className="json-view">{JSON.stringify(value, null, 2)}</pre>;
}
export function Time({ value }: { value?: string }) {
  return (
    <time dateTime={value}>
      {value
        ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
        : '—'}
    </time>
  );
}
export const shortId = (id?: string) => (id ? id.slice(0, 8) : '—');

export function LoadMore({
  query,
}: {
  query: {
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => Promise<unknown>;
  };
}) {
  return query.hasNextPage ? (
    <div className="pagination">
      <Button disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
        {query.isFetchingNextPage ? 'Loading…' : 'Load more records'}
      </Button>
    </div>
  ) : null;
}

export function tabKeyboard(event: import('react').KeyboardEvent<HTMLDivElement>): void {
  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
  );
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (current < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next]?.focus();
  buttons[next]?.click();
}
