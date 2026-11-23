// Unit tests for the pure client-side calculators. Run with `npm run test:unit`.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { splitCost } from '../../src/lib/costSplit.ts';
import { listingText } from '../../src/lib/listingText.ts';
import { channelFees, estimate, labourLine, maxPurchasePrice } from '../../src/lib/profit.ts';

const ebay = { fee_percent: 12.8, fixed_fee: 0.3 };
const gbp = (n: number) => `£${n.toFixed(0)}`;

describe('profit estimate', () => {
  test('profit, margin and fees for a channel', () => {
    const e = estimate({ cost: 185, salePrice: 280, channel: ebay, postageOut: 15, labourMinutes: 210, labourRate: null, targetMarginPercent: null });
    assert.equal(e.fees, 36.14); // 280 × 12.8% + 0.30
    assert.equal(e.profit, 43.86); // 280 − 36.14 − 15 − 185
    assert.equal(e.marginPercent, 15.7);
    assert.equal(e.labourHours, 3.5);
    assert.equal(e.labourCost, null);
    assert.equal(e.profitAfterLabour, null);
  });

  test('labour is costed only when a rate is set', () => {
    const e = estimate({ cost: 100, salePrice: 200, channel: null, postageOut: 0, labourMinutes: 240, labourRate: 30, targetMarginPercent: null });
    assert.equal(e.labourCost, 120);
    assert.equal(e.profit, 100);
    assert.equal(e.profitAfterLabour, -20);
    assert.equal(labourLine(e.labourHours, e.labourCost, gbp), '~4 h labour at £120 required');
    assert.equal(labourLine(4, null, gbp), '~4 h labour required');
  });

  test('break-even and price for a target margin solve back to the inputs', () => {
    const e = estimate({ cost: 185, salePrice: null, channel: ebay, postageOut: 15, labourMinutes: 0, labourRate: null, targetMarginPercent: 25 });
    assert.ok(e.breakEven !== null && e.priceForTarget !== null);
    // At break-even, profit is ~0.
    const atBreakEven = estimate({ cost: 185, salePrice: e.breakEven, channel: ebay, postageOut: 15, labourMinutes: 0, labourRate: null, targetMarginPercent: null });
    assert.ok(Math.abs(atBreakEven.profit) <= 0.01, `profit at break-even was ${atBreakEven.profit}`);
    // At the target price, margin is ~25%.
    const atTarget = estimate({ cost: 185, salePrice: e.priceForTarget, channel: ebay, postageOut: 15, labourMinutes: 0, labourRate: null, targetMarginPercent: null });
    assert.ok(Math.abs((atTarget.marginPercent ?? 0) - 25) <= 0.1, `margin was ${atTarget.marginPercent}`);
  });

  test('no target price when fees plus margin reach 100%', () => {
    const e = estimate({ cost: 10, salePrice: null, channel: { fee_percent: 50, fixed_fee: 0 }, postageOut: 0, labourMinutes: 0, labourRate: null, targetMarginPercent: 50 });
    assert.equal(e.priceForTarget, null);
    assert.equal(channelFees(0, ebay), 0);
  });

  test('what-if: most you can pay before buying', () => {
    // Sell for £200 on eBay, £10 postage, £20 of parts, 2 h at £15/h, want 20% margin.
    const max = maxPurchasePrice({ expectedSale: 200, channel: ebay, postageOut: 10, workCost: 20, labourMinutes: 120, labourRate: 15, targetMarginPercent: 20 });
    assert.equal(max, 74.1); // 200 − 25.90 fees − 10 − 20 − 30 labour − 40 margin
  });
});

describe('cost split preview', () => {
  test('explicit allocations kept, the rest shared equally', () => {
    const s = splitCost(110, [80, null, null]);
    assert.deepEqual(s.shares, [80, 15, 15]);
    assert.equal(s.remaining, 30);
    assert.equal(s.overAllocated, false);
    assert.equal(splitCost(100, [70, 40]).overAllocated, true);
  });
});

describe('listing text', () => {
  test('matches the spec format and leaves out empty fields', () => {
    const text = listingText({
      name: 'Srixon P–5 irons',
      contents: '5–PW',
      fields: [
        { name: 'Shaft', value: 'KBS Tour, Stiff' },
        { name: 'Loft', value: ' ' },
      ],
      condition: 'Good',
      work: [
        { service: 'Regrip', qty: 5, part: 'Golf Pride MCC' },
        { service: 'Groove sharpen', qty: 1, part: null },
      ],
    });
    assert.equal(
      text,
      ['Srixon P–5 irons (5–PW)', 'Shaft: KBS Tour, Stiff', 'Condition: Good', '', 'Work done:', '- 5 × Regrip (Golf Pride MCC)', '- Groove sharpen'].join('\n'),
    );
    assert.equal(listingText({ name: 'Putter', contents: null, fields: [], condition: null, work: [] }), 'Putter');
  });
});
