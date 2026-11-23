import { hoursMinutes, money } from '../lib/format';
import type { PartStock, Service, WorkLine } from '../lib/types';

interface Props {
  lines: WorkLine[];
  services: Service[];
  parts: PartStock[];
  onDelete?: (line: WorkLine) => void;
  /** Label each line with its item (job view). */
  itemLabel?: (itemId: string) => string;
}

export function lineParts(line: WorkLine, parts: PartStock[]): string {
  if (line.work_line_parts.length === 0) return 'No parts';
  return line.work_line_parts
    .map((p) => {
      if (p.customer_supplied) return p.description ?? "Customer's own";
      const name = parts.find((x) => x.part_id === p.part_id)?.name ?? 'Part';
      return `${name} ${money(p.unit_cost)}`;
    })
    .join(', ');
}

export function linePartsCost(line: WorkLine): number {
  return line.work_line_parts.filter((p) => !p.customer_supplied).reduce((s, p) => s + Math.round(p.qty * p.unit_cost * 100) / 100, 0);
}

/** Work lines with parts, time and cost, as on the desktop item design. */
export function WorkLinesTable({ lines, services, parts, onDelete, itemLabel }: Props) {
  const serviceName = (id: string) => services.find((s) => s.id === id)?.name ?? 'Service';
  const totalMinutes = lines.reduce((s, l) => s + l.minutes_each * l.qty, 0);
  const totalCost = lines.reduce((s, l) => s + linePartsCost(l) + l.extra_cost, 0);

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Service</th>
            <th className="desktop-only">Parts</th>
            <th className="num">Time</th>
            <th className="num">Cost</th>
            {onDelete && (
              <th>
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td>
                <span style={{ fontWeight: 600 }}>
                  {l.qty} × {serviceName(l.service_id)}
                </span>
                {itemLabel && <div className="field-hint">{itemLabel(l.item_id)}</div>}
                <div className="field-hint mobile-only">{lineParts(l, parts)}</div>
                {l.extra_cost > 0 && <div className="field-hint">+ {money(l.extra_cost)} extra</div>}
              </td>
              <td className="desktop-only muted">{lineParts(l, parts)}</td>
              <td className="num">{hoursMinutes(l.minutes_each * l.qty)}</td>
              <td className="num">{money(linePartsCost(l) + l.extra_cost)}</td>
              {onDelete && (
                <td className="num">
                  <button type="button" className="link-button danger" aria-label={`Remove ${l.qty} × ${serviceName(l.service_id)}`} onClick={() => onDelete(l)}>
                    ✕
                  </button>
                </td>
              )}
            </tr>
          ))}
          {lines.length > 1 && (
            <tr>
              <td style={{ fontWeight: 700 }}>Total</td>
              <td className="desktop-only" />
              <td className="num" style={{ fontWeight: 700 }}>
                {hoursMinutes(totalMinutes)}
              </td>
              <td className="num" style={{ fontWeight: 700 }}>
                {money(totalCost)}
              </td>
              {onDelete && <td />}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
