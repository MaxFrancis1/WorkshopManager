// Row shapes for the tables and views the app reads. Kept by hand in step with
// supabase/migrations; PostgREST returns numeric columns as JSON numbers.

export const ITEM_STATUSES = ['in_stock', 'in_work', 'ready', 'listed', 'sold', 'written_off'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const ACTIVE_STATUSES: ItemStatus[] = ['in_stock', 'in_work', 'ready', 'listed'];

export const STATUS_LABELS: Record<ItemStatus, string> = {
  in_stock: 'In stock',
  in_work: 'In work',
  ready: 'Ready',
  listed: 'Listed',
  sold: 'Sold',
  written_off: 'Written off',
};

export type FieldKind = 'text' | 'number' | 'select';

export interface CategoryField {
  id: string;
  category_id: string;
  name: string;
  kind: FieldKind;
  options: string[];
  sort_order: number;
}

export interface Category {
  id: string;
  name: string;
  category_fields: CategoryField[];
}

/** Custom field values keyed by category_fields.id. */
export type FieldValues = Record<string, string>;

export interface Item {
  id: string;
  short_id: string;
  name: string;
  category_id: string | null;
  contents: string | null;
  field_values: FieldValues;
  condition: string | null;
  status: ItemStatus;
  purchase_id: string | null;
  allocated_cost: number | null;
  customer_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface Purchase {
  id: string;
  purchased_on: string;
  source: string | null;
  price: number;
  postage_in: number;
  notes: string | null;
  created_at: string;
}

/** View: public.item_costs */
export interface ItemCost {
  item_id: string;
  short_id: string;
  name: string;
  status: ItemStatus;
  category_id: string | null;
  purchase_id: string | null;
  purchased_on: string | null;
  purchase_share: number;
  parts_cost: number;
  extras_cost: number;
  to_find_cost: number;
  total_cost: number;
  labour_minutes: number;
  labour_hours: number;
  labour_cost: number | null;
  work_charge: number;
  open_to_find_count: number;
}

/** View: public.purchase_allocations */
export interface PurchaseAllocation {
  purchase_id: string;
  purchased_on: string;
  source: string | null;
  total_cost: number;
  item_count: number;
  allocated_item_count: number;
  allocated_cost: number;
  unallocated_cost: number;
  over_allocated: boolean;
}

// ---------------------------------------------------------------------------
// Parts and services
// ---------------------------------------------------------------------------

export interface PartType {
  id: string;
  name: string;
}

/** View: public.part_stock */
export interface PartStock {
  part_id: string;
  name: string;
  part_type_id: string;
  part_type_name: string;
  unit_cost: number;
  qty_on_hand: number;
  reorder_level: number;
  low_stock: boolean;
}

export interface PartRestock {
  id: string;
  part_id: string;
  restocked_on: string;
  qty: number;
  unit_cost: number;
  supplier: string | null;
}

export interface ServicePart {
  id: string;
  service_id: string;
  part_type_id: string;
  qty: number;
  default_part_id: string | null;
}

export interface Service {
  id: string;
  name: string;
  default_minutes: number;
  price: number;
  notes: string | null;
  service_parts: ServicePart[];
}

export interface WorkLinePart {
  id: string;
  part_id: string | null;
  description: string | null;
  qty: number;
  unit_cost: number;
  customer_supplied: boolean;
}

export interface WorkLine {
  id: string;
  item_id: string;
  job_id: string | null;
  service_id: string;
  qty: number;
  minutes_each: number;
  price_each: number;
  extra_cost: number;
  notes: string | null;
  created_at: string;
  work_line_parts: WorkLinePart[];
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export const JOB_KINDS = ['refurb', 'build', 'customise', 'service'] as const;
export type JobKind = (typeof JOB_KINDS)[number];
export const JOB_KIND_LABELS: Record<JobKind, string> = {
  refurb: 'Refurb',
  build: 'Build',
  customise: 'Customise',
  service: 'Service',
};

export const JOB_STATUSES = ['open', 'in_progress', 'done', 'paid', 'cancelled'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  done: 'Done',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

export interface Job {
  id: string;
  kind: JobKind;
  status: JobStatus;
  title: string | null;
  target_price: number | null;
  notes: string | null;
  created_at: string;
}

/** View: public.job_totals */
export interface JobTotals {
  job_id: string;
  kind: JobKind;
  status: JobStatus;
  target_price: number | null;
  item_count: number;
  labour_minutes: number;
  labour_cost: number | null;
  parts_cost: number;
  extras_cost: number;
  work_charge: number;
}

// ---------------------------------------------------------------------------
// Selling
// ---------------------------------------------------------------------------

export interface Channel {
  id: string;
  name: string;
  fee_percent: number;
  fixed_fee: number;
}

export type ListingStatus = 'live' | 'sold' | 'withdrawn';

export interface Listing {
  id: string;
  channel_id: string;
  title: string | null;
  posted_on: string;
  asking_price: number | null;
  status: ListingStatus;
  ended_on: string | null;
  listing_items: { item_id: string }[];
}

/** View: public.sale_profits */
export interface SaleProfit {
  sale_id: string;
  sold_on: string;
  channel_id: string | null;
  listing_id: string | null;
  sale_price: number;
  fees: number;
  postage_out: number;
  item_count: number;
  items_cost: number;
  labour_minutes: number;
  profit: number;
  margin_percent: number | null;
  labour_cost: number | null;
  profit_after_labour: number | null;
  days_to_sell: number | null;
}

export interface Sale {
  id: string;
  sold_on: string;
  channel_id: string | null;
  sale_price: number;
  fees: number;
  postage_out: number;
  notes: string | null;
  sale_items: { item_id: string }[];
}

// ---------------------------------------------------------------------------
// Notes, overheads, settings, dashboard
// ---------------------------------------------------------------------------

export interface ToFindNote {
  id: string;
  item_id: string;
  description: string;
  status: 'open' | 'sourced';
  cost: number | null;
  sourced_on: string | null;
  created_at: string;
}

export interface Overhead {
  id: string;
  spent_on: string;
  description: string;
  amount: number;
}

export interface Settings {
  labour_rate: number | null;
  aged_stock_days: number;
}

export const DEFAULT_SETTINGS: Settings = { labour_rate: null, aged_stock_days: 90 };

/** View: public.dashboard_summary */
export interface DashboardSummary {
  stock_value: number;
  stock_count: number;
  month_profit: number;
  month_sales: number;
  month_overheads: number;
  ytd_profit: number;
  ytd_sales: number;
  ytd_losses: number;
  ytd_overheads: number;
  avg_days_to_sell: number | null;
  recent_sales_timed: number;
}

/** View: public.monthly_profit */
export interface MonthlyProfit {
  month: string;
  sales_count: number;
  revenue: number;
  profit: number;
  loss_count: number;
  overheads: number;
  profit_after_overheads: number;
}

/** View: public.channel_stats */
export interface ChannelStats {
  channel_id: string;
  name: string;
  posted: number;
  sold: number;
  sell_through_percent: number | null;
  avg_days_to_sell: number | null;
  live_listings: number;
}

/** View: public.category_sell_times */
export interface CategorySellTime {
  category_id: string;
  name: string;
  sales_count: number;
  avg_days_to_sell: number;
}

/** View: public.aged_stock */
export interface AgedStock {
  item_id: string;
  short_id: string;
  name: string;
  status: ItemStatus;
  purchased_on: string;
  days_in_stock: number;
  total_cost: number;
}

/** View: public.open_to_find */
export interface OpenToFind {
  note_id: string;
  description: string;
  item_id: string;
  short_id: string;
  item_name: string;
  item_status: ItemStatus;
  flagged: boolean;
}
