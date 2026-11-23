/**
 * Profit calculator (estimates only; actual profit comes from sale_profits).
 *
 * Profit = sale − fees − postage out − cost, where cost is the item's cost so far
 * (purchase share + parts + extras + sourced to-find parts). Labour is always
 * shown in hours; it is costed only when a labour rate is set.
 */

export interface ChannelFees {
  fee_percent: number;
  fixed_fee: number;
}

export interface Estimate {
  fees: number;
  profit: number;
  marginPercent: number | null;
  labourHours: number;
  labourCost: number | null;
  profitAfterLabour: number | null;
  /** Lowest sale price that covers cost, fees and postage (and labour when costed). */
  breakEven: number | null;
  /** Sale price needed to hit the target margin (on profit after labour when costed). */
  priceForTarget: number | null;
}

export interface EstimateInput {
  cost: number;
  salePrice: number | null;
  channel: ChannelFees | null;
  postageOut: number;
  labourMinutes: number;
  labourRate: number | null;
  targetMarginPercent: number | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function channelFees(salePrice: number, channel: ChannelFees | null): number {
  if (!channel || salePrice <= 0) return 0;
  return r2((salePrice * channel.fee_percent) / 100 + channel.fixed_fee);
}

/** Solves S − (S·f + fixed) − fixedCosts = margin·S for S. Null when no price can work. */
function priceFor(fixedCosts: number, channel: ChannelFees | null, margin: number): number | null {
  const f = (channel?.fee_percent ?? 0) / 100;
  const denom = 1 - f - margin;
  if (denom <= 0) return null;
  return r2((fixedCosts + (channel?.fixed_fee ?? 0)) / denom);
}

export function estimate(input: EstimateInput): Estimate {
  const labourHours = Math.round((input.labourMinutes / 60) * 100) / 100;
  const labourCost = input.labourRate !== null ? r2((input.labourMinutes / 60) * input.labourRate) : null;
  const costs = input.cost + input.postageOut + (labourCost ?? 0);
  const breakEven = priceFor(costs, input.channel, 0);
  const priceForTarget =
    input.targetMarginPercent !== null ? priceFor(costs, input.channel, input.targetMarginPercent / 100) : null;

  const sale = input.salePrice ?? 0;
  const fees = channelFees(sale, input.channel);
  const profit = r2(sale - fees - input.postageOut - input.cost);
  return {
    fees,
    profit,
    marginPercent: sale > 0 ? Math.round((profit / sale) * 1000) / 10 : null,
    labourHours,
    labourCost,
    profitAfterLabour: labourCost !== null ? r2(profit - labourCost) : null,
    breakEven,
    priceForTarget,
  };
}

export interface WhatIfInput {
  expectedSale: number;
  channel: ChannelFees | null;
  postageOut: number;
  workCost: number;
  labourMinutes: number;
  labourRate: number | null;
  targetMarginPercent: number;
}

/** Most you can pay for something and still make the target margin. */
export function maxPurchasePrice(input: WhatIfInput): number {
  const fees = channelFees(input.expectedSale, input.channel);
  const labour = input.labourRate !== null ? (input.labourMinutes / 60) * input.labourRate : 0;
  const target = (input.expectedSale * input.targetMarginPercent) / 100;
  return r2(input.expectedSale - fees - input.postageOut - input.workCost - labour - target);
}

/** "~4 h labour required" / "~4 h labour at £120 required". */
export function labourLine(hours: number, labourCost: number | null, formatMoney: (n: number) => string): string {
  const h = Math.round(hours * 10) / 10;
  return labourCost !== null ? `~${h} h labour at ${formatMoney(labourCost)} required` : `~${h} h labour required`;
}
