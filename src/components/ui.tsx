import type { ReactNode } from 'react';
import { STATUS_LABELS, type ItemStatus } from '../lib/types';

export function StatusBadge({ status }: { status: ItemStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABELS[status]}</span>;
}

/** The item's short ID as written on its tag. */
export function ShortId({ id, dark, large }: { id: string; dark?: boolean; large?: boolean }) {
  if (large) return <span className={`tag-id-lg${dark ? ' tag-id-dark' : ''}`}>{id}</span>;
  return <span className="tag-id">{id}</span>;
}

export function Loading() {
  return (
    <p className="muted" aria-busy="true">
      Loading…
    </p>
  );
}

export function ErrorNote({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return (
    <p className="alert alert-error" role="alert">
      {error}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <section className="card empty">{children}</section>;
}

export function PlusIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}
