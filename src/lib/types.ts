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
