import type { ReactNode } from 'react';

const dateFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

interface Props {
  title: string;
  actions?: ReactNode;
  showDate?: boolean;
}

export function PageHeader({ title, actions, showDate }: Props) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        {showDate && <span className="page-header-date">{dateFmt.format(new Date())}</span>}
        <h1 className="page-title">{title}</h1>
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}
