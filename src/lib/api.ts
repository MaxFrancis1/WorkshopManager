// All Supabase reads and writes for the app. Each function throws on error, so
// callers can use useAsync or try/catch. owner_id is never sent: the database
// fills it from the signed-in user and RLS checks it.

import { requireSupabase } from './supabase';
import type {
  Category,
  CategoryField,
  FieldKind,
  FieldValues,
  Item,
  ItemCost,
  ItemStatus,
  Purchase,
  PurchaseAllocation,
} from './types';

function db() {
  return requireSupabase();
}

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function listCategories(): Promise<Category[]> {
  const rows = must(
    await db()
      .from('categories')
      .select('id, name, category_fields (id, category_id, name, kind, options, sort_order)')
      .order('name'),
  ) as Category[];
  for (const c of rows) c.category_fields.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  return rows;
}

export async function createCategory(name: string): Promise<void> {
  must(await db().from('categories').insert({ name: name.trim() }));
}

export async function renameCategory(id: string, name: string): Promise<void> {
  must(await db().from('categories').update({ name: name.trim() }).eq('id', id));
}

export async function deleteCategory(id: string): Promise<void> {
  must(await db().from('categories').delete().eq('id', id));
}

export async function countItemsInCategory(id: string): Promise<number> {
  const res = await db().from('items').select('id', { count: 'exact', head: true }).eq('category_id', id);
  if (res.error) throw new Error(res.error.message);
  return res.count ?? 0;
}

export interface NewField {
  category_id: string;
  name: string;
  kind: FieldKind;
  options: string[];
  sort_order: number;
}

export async function createField(field: NewField): Promise<void> {
  must(await db().from('category_fields').insert({ ...field, name: field.name.trim() }));
}

export async function updateField(id: string, patch: Partial<Pick<CategoryField, 'name' | 'kind' | 'options' | 'sort_order'>>): Promise<void> {
  must(await db().from('category_fields').update(patch).eq('id', id));
}

export async function deleteField(id: string): Promise<void> {
  must(await db().from('category_fields').delete().eq('id', id));
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

const ITEM_COLUMNS =
  'id, short_id, name, category_id, contents, field_values, condition, status, purchase_id, allocated_cost, customer_id, notes, created_at';

export async function listItems(): Promise<Item[]> {
  return must(await db().from('items').select(ITEM_COLUMNS).order('created_at', { ascending: false })) as Item[];
}

export async function listItemCosts(): Promise<ItemCost[]> {
  return must(await db().from('item_costs').select('*')) as ItemCost[];
}

export async function getItem(id: string): Promise<Item | null> {
  return must(await db().from('items').select(ITEM_COLUMNS).eq('id', id).maybeSingle()) as Item | null;
}

export async function getItemCost(id: string): Promise<ItemCost | null> {
  return must(await db().from('item_costs').select('*').eq('item_id', id).maybeSingle()) as ItemCost | null;
}

export interface ItemInput {
  name: string;
  category_id: string | null;
  contents: string | null;
  field_values: FieldValues;
  condition: string | null;
  purchase_id: string | null;
  allocated_cost: number | null;
  notes: string | null;
  status?: ItemStatus;
}

export async function createItem(input: ItemInput): Promise<Item> {
  return must(await db().from('items').insert(input).select(ITEM_COLUMNS).single()) as Item;
}

export async function updateItem(id: string, patch: Partial<ItemInput>): Promise<void> {
  must(await db().from('items').update(patch).eq('id', id));
}

export async function deleteItem(id: string): Promise<void> {
  must(await db().from('items').delete().eq('id', id));
}

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------

const PURCHASE_COLUMNS = 'id, purchased_on, source, price, postage_in, notes, created_at';

export async function listPurchaseAllocations(): Promise<PurchaseAllocation[]> {
  return must(
    await db().from('purchase_allocations').select('*').order('purchased_on', { ascending: false }),
  ) as PurchaseAllocation[];
}

export async function listPurchases(): Promise<Purchase[]> {
  return must(
    await db().from('purchases').select(PURCHASE_COLUMNS).order('purchased_on', { ascending: false }),
  ) as Purchase[];
}

export async function getPurchase(id: string): Promise<Purchase | null> {
  return must(await db().from('purchases').select(PURCHASE_COLUMNS).eq('id', id).maybeSingle()) as Purchase | null;
}

export async function getPurchaseAllocation(id: string): Promise<PurchaseAllocation | null> {
  return must(
    await db().from('purchase_allocations').select('*').eq('purchase_id', id).maybeSingle(),
  ) as PurchaseAllocation | null;
}

export async function listItemCostsForPurchase(purchaseId: string): Promise<ItemCost[]> {
  return must(
    await db().from('item_costs').select('*').eq('purchase_id', purchaseId).order('short_id'),
  ) as ItemCost[];
}

export interface PurchaseInput {
  purchased_on: string;
  source: string | null;
  price: number;
  postage_in: number;
  notes: string | null;
}

export interface PurchaseItemInput {
  name: string;
  category_id: string | null;
  contents: string | null;
  condition: string | null;
  field_values: FieldValues;
  allocated_cost: number | null;
}

/** Saves a purchase and its items in one transaction. Returns the purchase id. */
export async function logPurchase(purchase: PurchaseInput, items: PurchaseItemInput[]): Promise<string> {
  return must(await db().rpc('log_purchase', { p_purchase: purchase, p_items: items })) as string;
}

export async function updatePurchase(id: string, patch: Partial<PurchaseInput>): Promise<void> {
  must(await db().from('purchases').update(patch).eq('id', id));
}

export async function deletePurchase(id: string): Promise<void> {
  must(await db().from('purchases').delete().eq('id', id));
}

/** Past purchase sources, most recent first, for the source suggestions list. */
export async function listSources(): Promise<string[]> {
  const rows = must(
    await db().from('purchases').select('source').not('source', 'is', null).order('purchased_on', { ascending: false }).limit(200),
  ) as { source: string }[];
  return [...new Set(rows.map((r) => r.source))];
}
