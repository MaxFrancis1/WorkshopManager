-- Workshop Manager: core schema.
--
-- Conventions (see CLAUDE.md):
--   * Every table has owner_id uuid not null default auth.uid().
--   * RLS on every table; one policy per table: owner_id = auth.uid().
--   * Money is numeric(10,2) GBP; part unit costs are numeric(12,4) so weighted
--     averages keep their precision.
--   * Status-like columns are text + check constraint, so values can be added in
--     a later migration without ALTER TYPE.

-- ---------------------------------------------------------------------------
-- Settings (one row per owner)
-- ---------------------------------------------------------------------------

create table public.settings (
  owner_id        uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  labour_rate     numeric(10,2) check (labour_rate is null or labour_rate >= 0),  -- £/h; null = labour not costed
  aged_stock_days integer not null default 90 check (aged_stock_days > 0),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Categories and their custom fields
-- ---------------------------------------------------------------------------

create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table public.category_fields (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),          -- e.g. Shaft, Flex, Loft
  kind        text not null default 'text' check (kind in ('text', 'number', 'select')),
  options     text[] not null default '{}',                           -- choices when kind = 'select'
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (category_id, name)
);

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------

create table public.customers (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (length(btrim(name)) > 0),
  contact    text,
  notes      text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Purchases and items
-- ---------------------------------------------------------------------------

create table public.purchases (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  purchased_on date not null default current_date,
  source       text,
  price        numeric(10,2) not null default 0 check (price >= 0),
  postage_in   numeric(10,2) not null default 0 check (postage_in >= 0),
  notes        text,
  created_at   timestamptz not null default now()
);

create table public.items (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Auto-assigned by trigger: 2 chars from 2-9 and A-Z without I and O, 3 when 2 run out.
  short_id       text not null check (short_id ~ '^[2-9A-HJ-NP-Z]{2,}$'),
  name           text not null check (length(btrim(name)) > 0),
  category_id    uuid references public.categories (id) on delete set null,
  contents       text,                                                -- e.g. 5–PW
  field_values   jsonb not null default '{}' check (jsonb_typeof(field_values) = 'object'),  -- keyed by category_fields.id
  condition      text,
  status         text not null default 'in_stock'
                 check (status in ('in_stock', 'in_work', 'ready', 'listed', 'sold', 'written_off')),
  purchase_id    uuid references public.purchases (id) on delete restrict,
  -- This item's share of its purchase. Null = an equal share of whatever the
  -- purchase total has not explicitly allocated to other items.
  allocated_cost numeric(10,2) check (allocated_cost is null or allocated_cost >= 0),
  -- Set for a customer's own item (service jobs): not stock, no purchase cost.
  customer_id    uuid references public.customers (id) on delete restrict,
  notes          text,
  created_at     timestamptz not null default now(),
  unique (owner_id, short_id),
  check (customer_id is null or purchase_id is null)
);

create index items_purchase_id_idx on public.items (purchase_id);
create index items_category_id_idx on public.items (category_id);
create index items_customer_id_idx on public.items (customer_id);

create table public.to_find_notes (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id     uuid not null references public.items (id) on delete cascade,
  description text not null check (length(btrim(description)) > 0),  -- e.g. 7-iron, Srixon Z-Forged, stiff
  status      text not null default 'open' check (status in ('open', 'sourced')),
  cost        numeric(10,2) check (cost is null or cost >= 0),        -- added to the item's cost once sourced
  sourced_on  date,
  created_at  timestamptz not null default now(),
  check (status = 'open' or cost is not null)
);

create index to_find_notes_item_id_idx on public.to_find_notes (item_id);

-- ---------------------------------------------------------------------------
-- Parts stock
-- ---------------------------------------------------------------------------

create table public.part_types (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (length(btrim(name)) > 0),           -- e.g. Grip, Tape
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table public.parts (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  part_type_id  uuid not null references public.part_types (id) on delete restrict,
  name          text not null check (length(btrim(name)) > 0),        -- e.g. Golf Pride MCC Std
  unit_cost     numeric(12,4) not null default 0 check (unit_cost >= 0),
  qty_on_hand   integer not null default 0,                           -- may go negative if usage outruns logged stock
  reorder_level integer not null default 0 check (reorder_level >= 0),
  created_at    timestamptz not null default now(),
  unique (owner_id, name)
);

create index parts_part_type_id_idx on public.parts (part_type_id);

-- A parts purchase. Insert-only: a trigger adds the qty and moves unit_cost to the
-- weighted average. Delete to correct a mistake (qty is taken back off).
create table public.part_restocks (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  part_id      uuid not null references public.parts (id) on delete cascade,
  restocked_on date not null default current_date,
  qty          integer not null check (qty > 0),
  unit_cost    numeric(12,4) not null check (unit_cost >= 0),
  supplier     text,
  created_at   timestamptz not null default now()
);

create index part_restocks_part_id_idx on public.part_restocks (part_id);

-- ---------------------------------------------------------------------------
-- Services
-- ---------------------------------------------------------------------------

create table public.services (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null check (length(btrim(name)) > 0),      -- e.g. Regrip
  default_minutes integer not null default 0 check (default_minutes >= 0),
  price           numeric(10,2) not null default 0 check (price >= 0), -- charged to a customer, per unit
  notes           text,
  created_at      timestamptz not null default now(),
  unique (owner_id, name)
);

-- Parts a service needs, by type: Regrip = 1 × Grip + 1 × Tape.
create table public.service_parts (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  service_id      uuid not null references public.services (id) on delete cascade,
  part_type_id    uuid not null references public.part_types (id) on delete restrict,
  qty             integer not null default 1 check (qty > 0),
  default_part_id uuid references public.parts (id) on delete set null,
  unique (service_id, part_type_id)
);

-- ---------------------------------------------------------------------------
-- Jobs and work lines
-- ---------------------------------------------------------------------------

create table public.jobs (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind         text not null check (kind in ('refurb', 'build', 'customise', 'service')),
  status       text not null default 'open' check (status in ('open', 'in_progress', 'done', 'paid', 'cancelled')),
  title        text,
  customer_id  uuid references public.customers (id) on delete restrict,
  target_price numeric(10,2) check (target_price is null or target_price >= 0),
  paid_on      date,
  notes        text,
  created_at   timestamptz not null default now()
);

create table public.job_items (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id   uuid not null references public.jobs (id) on delete cascade,
  item_id  uuid not null references public.items (id) on delete cascade,
  primary key (job_id, item_id)
);

create index job_items_item_id_idx on public.job_items (item_id);

-- One service done to one item, qty times (5 × Regrip). minutes_each and
-- price_each default from the service when left null on insert.
create table public.work_lines (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id      uuid not null references public.items (id) on delete cascade,
  job_id       uuid references public.jobs (id) on delete set null,
  service_id   uuid not null references public.services (id) on delete restrict,
  qty          integer not null default 1 check (qty > 0),
  minutes_each integer not null check (minutes_each >= 0),
  price_each   numeric(10,2) not null check (price_each >= 0),
  extra_cost   numeric(10,2) not null default 0 check (extra_cost >= 0),
  notes        text,
  done_on      date,
  created_at   timestamptz not null default now()
);

create index work_lines_item_id_idx on public.work_lines (item_id);
create index work_lines_job_id_idx on public.work_lines (job_id);
create index work_lines_service_id_idx on public.work_lines (service_id);

-- The specific parts used on a work line. unit_cost is a snapshot of the part's
-- cost when chosen, so later restocks do not rewrite history. Stock moves by
-- trigger unless the customer supplied the part.
create table public.work_line_parts (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  work_line_id      uuid not null references public.work_lines (id) on delete cascade,
  part_id           uuid references public.parts (id) on delete restrict,
  description       text,                                             -- for customer-supplied parts not in stock
  qty               integer not null check (qty > 0),                 -- total for the line, e.g. 5 grips
  unit_cost         numeric(12,4) not null check (unit_cost >= 0),
  customer_supplied boolean not null default false,
  created_at        timestamptz not null default now(),
  check (part_id is not null or customer_supplied)
);

create index work_line_parts_work_line_id_idx on public.work_line_parts (work_line_id);
create index work_line_parts_part_id_idx on public.work_line_parts (part_id);

-- ---------------------------------------------------------------------------
-- Selling: channels, listings, sales
-- ---------------------------------------------------------------------------

create table public.channels (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),          -- eBay, Facebook, Local / club
  fee_percent numeric(5,2) not null default 0 check (fee_percent between 0 and 100),
  fixed_fee   numeric(10,2) not null default 0 check (fixed_fee >= 0),
  created_at  timestamptz not null default now(),
  unique (owner_id, name)
);

-- One listing per channel. A lot is a listing with several items.
create table public.listings (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  channel_id   uuid not null references public.channels (id) on delete restrict,
  title        text,
  posted_on    date not null default current_date,                    -- kept on price drops, for listing age
  asking_price numeric(10,2) check (asking_price is null or asking_price >= 0),
  status       text not null default 'live' check (status in ('live', 'sold', 'withdrawn')),
  ended_on     date,
  notes        text,
  created_at   timestamptz not null default now()
);

create index listings_channel_id_idx on public.listings (channel_id);

create table public.listing_items (
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  item_id    uuid not null references public.items (id) on delete cascade,
  primary key (listing_id, item_id)
);

create index listing_items_item_id_idx on public.listing_items (item_id);

-- Fees are stored as charged; the app pre-fills them from the channel.
create table public.sales (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sold_on     date not null default current_date,
  channel_id  uuid references public.channels (id) on delete restrict,
  listing_id  uuid references public.listings (id) on delete set null,
  customer_id uuid references public.customers (id) on delete restrict,
  sale_price  numeric(10,2) not null check (sale_price >= 0),
  fees        numeric(10,2) not null default 0 check (fees >= 0),
  postage_out numeric(10,2) not null default 0 check (postage_out >= 0),
  notes       text,
  created_at  timestamptz not null default now()
);

create index sales_channel_id_idx on public.sales (channel_id);
create index sales_listing_id_idx on public.sales (listing_id);

create table public.sale_items (
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sale_id  uuid not null references public.sales (id) on delete cascade,
  item_id  uuid not null references public.items (id) on delete restrict,
  primary key (sale_id, item_id)
);

create index sale_items_item_id_idx on public.sale_items (item_id);

-- ---------------------------------------------------------------------------
-- Overheads
-- ---------------------------------------------------------------------------

create table public.overheads (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  spent_on    date not null default current_date,
  description text not null check (length(btrim(description)) > 0),
  amount      numeric(10,2) not null check (amount >= 0),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row level security and grants
-- ---------------------------------------------------------------------------

-- Same policy on every table: a row is visible and writable only by its owner.
-- Tests assert every public table has RLS on and this policy.
do $$
declare
  t text;
begin
  foreach t in array array[
    'settings', 'categories', 'category_fields', 'customers', 'purchases', 'items',
    'to_find_notes', 'part_types', 'parts', 'part_restocks', 'services', 'service_parts',
    'jobs', 'job_items', 'work_lines', 'work_line_parts', 'channels', 'listings',
    'listing_items', 'sales', 'sale_items', 'overheads'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy owner_all on public.%I for all to authenticated '
      'using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))',
      t
    );
  end loop;
end
$$;

-- Supabase grants new public tables to anon by default. This app has no
-- anonymous access at all, so take it away (RLS would block it anyway).
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
-- Covers tables later migrations create as this role. Functions are revoked
-- individually where they are created.
alter default privileges in schema public revoke all on tables from anon;
