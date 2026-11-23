// All Supabase reads and writes for the app. Each function throws on error, so
// callers can use useAsync or try/catch. owner_id is never sent: the database
// fills it from the signed-in user and RLS checks it.

import { requireSupabase } from './supabase';
import type {
  AgedStock,
  Category,
  CategoryField,
  CategorySellTime,
  Channel,
  ChannelStats,
  DashboardSummary,
  FieldKind,
  FieldValues,
  Item,
  ItemCost,
  ItemStatus,
  Job,
  JobKind,
  JobStatus,
  JobTotals,
  Listing,
  MonthlyProfit,
  OpenToFind,
  Overhead,
  PartRestock,
  PartStock,
  PartType,
  Purchase,
  PurchaseAllocation,
  Sale,
  SaleProfit,
  Service,
  ServicePart,
  Settings,
  ToFindNote,
  WorkLine,
} from './types';
import { DEFAULT_SETTINGS } from './types';

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

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

export async function listPartTypes(): Promise<PartType[]> {
  return must(await db().from('part_types').select('id, name').order('name')) as PartType[];
}

export async function createPartType(name: string): Promise<void> {
  must(await db().from('part_types').insert({ name: name.trim() }));
}

export async function renamePartType(id: string, name: string): Promise<void> {
  must(await db().from('part_types').update({ name: name.trim() }).eq('id', id));
}

export async function deletePartType(id: string): Promise<void> {
  must(await db().from('part_types').delete().eq('id', id));
}

export async function listPartStock(): Promise<PartStock[]> {
  return must(await db().from('part_stock').select('*').order('name')) as PartStock[];
}

export async function getPartStock(id: string): Promise<PartStock | null> {
  return must(await db().from('part_stock').select('*').eq('part_id', id).maybeSingle()) as PartStock | null;
}

export interface PartInput {
  part_type_id: string;
  name: string;
  unit_cost: number;
  qty_on_hand: number;
  reorder_level: number;
}

export async function createPart(input: PartInput): Promise<string> {
  const row = must(await db().from('parts').insert({ ...input, name: input.name.trim() }).select('id').single()) as { id: string };
  return row.id;
}

export async function updatePart(id: string, patch: Partial<PartInput>): Promise<void> {
  must(await db().from('parts').update(patch).eq('id', id));
}

export async function deletePart(id: string): Promise<void> {
  must(await db().from('parts').delete().eq('id', id));
}

export async function listRestocks(partId: string): Promise<PartRestock[]> {
  return must(
    await db()
      .from('part_restocks')
      .select('id, part_id, restocked_on, qty, unit_cost, supplier')
      .eq('part_id', partId)
      .order('restocked_on', { ascending: false })
      .order('created_at', { ascending: false }),
  ) as PartRestock[];
}

export async function addRestock(input: { part_id: string; restocked_on: string; qty: number; unit_cost: number; supplier: string | null }): Promise<void> {
  must(await db().from('part_restocks').insert(input));
}

export async function deleteRestock(id: string): Promise<void> {
  must(await db().from('part_restocks').delete().eq('id', id));
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

const SERVICE_COLUMNS = 'id, name, default_minutes, price, notes, service_parts (id, service_id, part_type_id, qty, default_part_id)';

export async function listServices(): Promise<Service[]> {
  return must(await db().from('services').select(SERVICE_COLUMNS).order('name')) as Service[];
}

export async function getService(id: string): Promise<Service | null> {
  return must(await db().from('services').select(SERVICE_COLUMNS).eq('id', id).maybeSingle()) as Service | null;
}

export interface ServiceInput {
  name: string;
  default_minutes: number;
  price: number;
  notes: string | null;
}

export type ServicePartInput = Pick<ServicePart, 'part_type_id' | 'qty' | 'default_part_id'>;

/** Saves a service and makes its parts list match `parts` (one row per part type). */
export async function saveService(id: string | null, input: ServiceInput, parts: ServicePartInput[]): Promise<string> {
  let serviceId = id;
  if (serviceId) {
    must(await db().from('services').update({ ...input, name: input.name.trim() }).eq('id', serviceId));
  } else {
    const row = must(await db().from('services').insert({ ...input, name: input.name.trim() }).select('id').single()) as { id: string };
    serviceId = row.id;
  }
  const keep = parts.map((p) => p.part_type_id);
  const del = db().from('service_parts').delete().eq('service_id', serviceId);
  must(await (keep.length ? del.not('part_type_id', 'in', `(${keep.join(',')})`) : del));
  if (parts.length) {
    must(
      await db()
        .from('service_parts')
        .upsert(parts.map((p) => ({ ...p, service_id: serviceId })), { onConflict: 'service_id,part_type_id' }),
    );
  }
  return serviceId;
}

export async function deleteService(id: string): Promise<void> {
  must(await db().from('services').delete().eq('id', id));
}

// ---------------------------------------------------------------------------
// Work lines
// ---------------------------------------------------------------------------

const WORK_LINE_COLUMNS =
  'id, item_id, job_id, service_id, qty, minutes_each, price_each, extra_cost, notes, created_at, work_line_parts (id, part_id, description, qty, unit_cost, customer_supplied)';

export async function listWorkLinesForItem(itemId: string): Promise<WorkLine[]> {
  return must(
    await db().from('work_lines').select(WORK_LINE_COLUMNS).eq('item_id', itemId).order('created_at'),
  ) as WorkLine[];
}

export async function listWorkLinesForJob(jobId: string): Promise<WorkLine[]> {
  return must(await db().from('work_lines').select(WORK_LINE_COLUMNS).eq('job_id', jobId).order('created_at')) as WorkLine[];
}

export interface WorkLineInput {
  item_id: string;
  service_id: string;
  qty: number;
  job_id?: string | null;
  minutes_each?: number | null;
  price_each?: number | null;
  extra_cost?: number;
  notes?: string | null;
}

export interface WorkLinePartInput {
  part_id: string | null;
  qty: number;
  customer_supplied: boolean;
  description?: string | null;
}

/** A work line and its parts in one transaction; stock moves by trigger. */
export async function addWorkLine(line: WorkLineInput, parts: WorkLinePartInput[]): Promise<string> {
  return must(await db().rpc('add_work_line', { p_line: line, p_parts: parts })) as string;
}

/** Deleting a work line returns its parts to stock. */
export async function deleteWorkLine(id: string): Promise<void> {
  must(await db().from('work_lines').delete().eq('id', id));
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

const JOB_COLUMNS = 'id, kind, status, title, target_price, notes, created_at';

export async function listJobs(): Promise<Job[]> {
  return must(await db().from('jobs').select(JOB_COLUMNS).order('created_at', { ascending: false })) as Job[];
}

export async function listJobTotals(): Promise<JobTotals[]> {
  return must(await db().from('job_totals').select('*')) as JobTotals[];
}

export async function getJob(id: string): Promise<Job | null> {
  return must(await db().from('jobs').select(JOB_COLUMNS).eq('id', id).maybeSingle()) as Job | null;
}

export async function getJobTotals(id: string): Promise<JobTotals | null> {
  return must(await db().from('job_totals').select('*').eq('job_id', id).maybeSingle()) as JobTotals | null;
}

export async function listJobItemIds(jobId: string): Promise<string[]> {
  const rows = must(await db().from('job_items').select('item_id').eq('job_id', jobId)) as { item_id: string }[];
  return rows.map((r) => r.item_id);
}

export interface JobInput {
  kind: JobKind;
  title: string | null;
  target_price: number | null;
  notes: string | null;
  status?: JobStatus;
}

export async function createJob(input: JobInput, itemIds: string[]): Promise<string> {
  return must(await db().rpc('create_job', { p_job: input, p_item_ids: itemIds })) as string;
}

export async function updateJob(id: string, patch: Partial<JobInput>): Promise<void> {
  must(await db().from('jobs').update(patch).eq('id', id));
}

export async function deleteJob(id: string): Promise<void> {
  must(await db().from('jobs').delete().eq('id', id));
}

export async function addJobItems(jobId: string, itemIds: string[]): Promise<void> {
  must(await db().from('job_items').upsert(itemIds.map((item_id) => ({ job_id: jobId, item_id })), { onConflict: 'job_id,item_id' }));
}

export async function removeJobItem(jobId: string, itemId: string): Promise<void> {
  must(await db().from('job_items').delete().eq('job_id', jobId).eq('item_id', itemId));
}

// ---------------------------------------------------------------------------
// Channels and listings
// ---------------------------------------------------------------------------

export async function listChannels(): Promise<Channel[]> {
  return must(await db().from('channels').select('id, name, fee_percent, fixed_fee').order('name')) as Channel[];
}

export async function createChannel(input: Omit<Channel, 'id'>): Promise<void> {
  must(await db().from('channels').insert({ ...input, name: input.name.trim() }));
}

export async function updateChannel(id: string, patch: Partial<Omit<Channel, 'id'>>): Promise<void> {
  must(await db().from('channels').update(patch).eq('id', id));
}

export async function deleteChannel(id: string): Promise<void> {
  must(await db().from('channels').delete().eq('id', id));
}

const LISTING_COLUMNS = 'id, channel_id, title, posted_on, asking_price, status, ended_on, listing_items!inner (item_id)';

export async function listListingsForItem(itemId: string): Promise<Listing[]> {
  return must(
    await db().from('listings').select(LISTING_COLUMNS).eq('listing_items.item_id', itemId).order('posted_on', { ascending: false }),
  ) as Listing[];
}

export async function createListing(
  listing: { channel_id: string; asking_price: number | null; title?: string | null; posted_on?: string },
  itemIds: string[],
): Promise<string> {
  return must(await db().rpc('create_listing', { p_listing: listing, p_item_ids: itemIds })) as string;
}

/** Price changes keep posted_on, so listing age is kept. */
export async function updateListingPrice(id: string, askingPrice: number | null): Promise<void> {
  must(await db().from('listings').update({ asking_price: askingPrice }).eq('id', id));
}

export async function withdrawListing(id: string): Promise<void> {
  must(await db().rpc('withdraw_listing', { p_listing_id: id }));
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

export async function listSaleProfits(): Promise<SaleProfit[]> {
  return must(await db().from('sale_profits').select('*').order('sold_on', { ascending: false })) as SaleProfit[];
}

export async function getSaleProfit(id: string): Promise<SaleProfit | null> {
  return must(await db().from('sale_profits').select('*').eq('sale_id', id).maybeSingle()) as SaleProfit | null;
}

export async function getSale(id: string): Promise<Sale | null> {
  return must(
    await db().from('sales').select('id, sold_on, channel_id, sale_price, fees, postage_out, notes, sale_items (item_id)').eq('id', id).maybeSingle(),
  ) as Sale | null;
}

export async function listSaleItemLinks(): Promise<{ sale_id: string; item_id: string }[]> {
  return must(await db().from('sale_items').select('sale_id, item_id')) as { sale_id: string; item_id: string }[];
}

export interface SaleInput {
  sold_on: string;
  channel_id: string | null;
  sale_price: number;
  fees: number;
  postage_out: number;
  notes: string | null;
}

export async function recordSale(sale: SaleInput, itemIds: string[]): Promise<string> {
  return must(await db().rpc('record_sale', { p_sale: sale, p_item_ids: itemIds })) as string;
}

export async function deleteSale(id: string): Promise<void> {
  must(await db().rpc('delete_sale', { p_sale_id: id }));
}

// ---------------------------------------------------------------------------
// To-find notes
// ---------------------------------------------------------------------------

export async function listToFindNotes(itemId: string): Promise<ToFindNote[]> {
  return must(
    await db().from('to_find_notes').select('id, item_id, description, status, cost, sourced_on, created_at').eq('item_id', itemId).order('created_at'),
  ) as ToFindNote[];
}

export async function addToFindNote(itemId: string, description: string): Promise<void> {
  must(await db().from('to_find_notes').insert({ item_id: itemId, description: description.trim() }));
}

export async function markSourced(id: string, cost: number, sourcedOn: string): Promise<void> {
  must(await db().from('to_find_notes').update({ status: 'sourced', cost, sourced_on: sourcedOn }).eq('id', id));
}

export async function reopenToFindNote(id: string): Promise<void> {
  must(await db().from('to_find_notes').update({ status: 'open', cost: null, sourced_on: null }).eq('id', id));
}

export async function deleteToFindNote(id: string): Promise<void> {
  must(await db().from('to_find_notes').delete().eq('id', id));
}

// ---------------------------------------------------------------------------
// Overheads and settings
// ---------------------------------------------------------------------------

export async function listOverheads(): Promise<Overhead[]> {
  return must(
    await db().from('overheads').select('id, spent_on, description, amount').order('spent_on', { ascending: false }).order('created_at', { ascending: false }),
  ) as Overhead[];
}

export async function addOverhead(input: Omit<Overhead, 'id'>): Promise<void> {
  must(await db().from('overheads').insert({ ...input, description: input.description.trim() }));
}

export async function deleteOverhead(id: string): Promise<void> {
  must(await db().from('overheads').delete().eq('id', id));
}

/** The settings row, or defaults when none has been saved yet. */
export async function getSettings(): Promise<Settings> {
  const row = must(await db().from('settings').select('labour_rate, aged_stock_days').maybeSingle()) as Settings | null;
  return row ?? DEFAULT_SETTINGS;
}

export async function saveSettings(settings: Settings): Promise<void> {
  const existing = must(await db().from('settings').select('owner_id').maybeSingle());
  if (existing) must(await db().from('settings').update(settings).not('owner_id', 'is', null));
  else must(await db().from('settings').insert(settings));
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardData {
  summary: DashboardSummary;
  months: MonthlyProfit[];
  channels: ChannelStats[];
  categories: CategorySellTime[];
  aged: AgedStock[];
  toFind: OpenToFind[];
  lowStock: PartStock[];
  agedDays: number;
}

export async function getDashboard(): Promise<DashboardData> {
  const [summary, months, channels, categories, aged, toFind, lowStock, settings] = await Promise.all([
    db().from('dashboard_summary').select('*').single(),
    db().from('monthly_profit').select('*').order('month'),
    db().from('channel_stats').select('*').order('posted', { ascending: false }),
    db().from('category_sell_times').select('*').order('sales_count', { ascending: false }),
    db().from('aged_stock').select('*').order('days_in_stock', { ascending: false }),
    db().from('open_to_find').select('*').order('flagged', { ascending: false }),
    db().from('part_stock').select('*').eq('low_stock', true).order('qty_on_hand'),
    getSettings(),
  ]);
  return {
    summary: must(summary) as DashboardSummary,
    months: must(months) as MonthlyProfit[],
    channels: must(channels) as ChannelStats[],
    categories: must(categories) as CategorySellTime[],
    aged: must(aged) as AgedStock[],
    toFind: must(toFind) as OpenToFind[],
    lowStock: must(lowStock) as PartStock[],
    agedDays: settings.aged_stock_days,
  };
}
