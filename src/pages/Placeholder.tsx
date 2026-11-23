import { PageHeader } from '../layout/PageHeader';

/** Stand-in for sections built in later phases. */
export function Placeholder({ title, phase, showDate }: { title: string; phase: number; showDate?: boolean }) {
  return (
    <div className="page">
      <PageHeader title={title} showDate={showDate} />
      <section className="card empty">
        <p>Coming in phase {phase}.</p>
      </section>
    </div>
  );
}
