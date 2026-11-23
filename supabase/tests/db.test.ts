// Database tests: apply every migration to an in-memory Postgres (PGlite) with a
// stand-in for Supabase's auth schema, then check RLS, triggers and cost views.
// Run with `npm run test:db`.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite, type Transaction } from '@electric-sql/pglite';

const supabaseDir = join(import.meta.dirname, '..');
const migrationsDir = join(supabaseDir, 'migrations');

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const C = '00000000-0000-0000-0000-00000000000c';

type Row = Record<string, unknown>;

let db: PGlite;

/** Run fn in a transaction as a signed-in user (or anon when uid is null), like a PostgREST request. */
async function as<T>(uid: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? 'authenticated' : 'anon'}`);
    const claims = uid ? { sub: uid, role: 'authenticated' } : { role: 'anon' };
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    return fn(tx);
  });
}

/** First row of a query run as a user. */
async function one(uid: string | null, sql: string, params: unknown[] = []): Promise<Row> {
  const { rows } = await as(uid, (tx) => tx.query<Row>(sql, params));
  assert.ok(rows[0], `no row returned by: ${sql}`);
  return rows[0];
}

async function all(uid: string | null, sql: string, params: unknown[] = []): Promise<Row[]> {
  const { rows } = await as(uid, (tx) => tx.query<Row>(sql, params));
  return rows;
}

async function affected(uid: string | null, sql: string, params: unknown[] = []): Promise<number> {
  const res = await as(uid, (tx) => tx.query(sql, params));
  return res.affectedRows ?? 0;
}

const n = (v: unknown) => (v === null || v === undefined ? v : Number(v));

before(async () => {
  db = await PGlite.create();
  await db.exec(readFileSync(join(supabaseDir, 'tests', 'support', 'supabase-stub.sql'), 'utf8'));
  await db.query(`insert into auth.users (id, email) values ($1, 'a@test'), ($2, 'b@test'), ($3, 'c@test')`, [A, B, C]);

  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  assert.ok(files.length > 0, 'no migrations found');
  for (const file of files) {
    try {
      await db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
    } catch (err) {
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    }
  }
});

after(async () => {
  await db?.close();
});

describe('schema guards', () => {
  test('every public table has RLS enabled and the owner policy', async () => {
    const tables = await db.query<{ relname: string; relrowsecurity: boolean }>(`
      select c.relname, c.relrowsecurity
      from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
      where ns.nspname = 'public' and c.relkind = 'r'`);
    assert.ok(tables.rows.length >= 20, 'expected the full schema');

    const policies = await db.query<{ tablename: string }>(`
      select tablename from pg_policies
      where schemaname = 'public' and policyname = 'owner_all'
        and qual like '%owner_id%auth.uid()%' and with_check like '%owner_id%auth.uid()%'`);
    const withPolicy = new Set(policies.rows.map((r) => r.tablename));

    for (const t of tables.rows) {
      assert.ok(t.relrowsecurity, `RLS is off on ${t.relname}`);
      assert.ok(withPolicy.has(t.relname), `${t.relname} has no owner_all policy`);
    }
  });

  test('every public table has a non-null owner_id defaulting to auth.uid()', async () => {
    const { rows } = await db.query<{ table_name: string; is_nullable: string; column_default: string | null }>(`
      select t.table_name, col.is_nullable, col.column_default
      from information_schema.tables t
      left join information_schema.columns col
        on col.table_schema = t.table_schema and col.table_name = t.table_name and col.column_name = 'owner_id'
      where t.table_schema = 'public' and t.table_type = 'BASE TABLE'`);
    for (const r of rows) {
      assert.equal(r.is_nullable, 'NO', `${r.table_name}.owner_id missing or nullable`);
      assert.match(r.column_default ?? '', /auth\.uid\(\)/, `${r.table_name}.owner_id default is not auth.uid()`);
    }
  });

  test('every public view is security_invoker', async () => {
    const { rows } = await db.query<{ relname: string; reloptions: string[] | null }>(`
      select c.relname, c.reloptions
      from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
      where ns.nspname = 'public' and c.relkind = 'v'`);
    assert.ok(rows.length >= 5);
    for (const v of rows) {
      assert.ok(v.reloptions?.includes('security_invoker=true'), `${v.relname} is not security_invoker`);
    }
  });
});

describe('access control', () => {
  test('anon cannot read tables or views', async () => {
    await assert.rejects(all(null, 'select * from items'), /permission denied/);
    await assert.rejects(all(null, 'select * from item_costs'), /permission denied/);
    await assert.rejects(all(null, `insert into categories (name) values ('x')`), /permission denied/);
  });

  test("users only see and change their own rows", async () => {
    const cat = await one(A, `insert into categories (name) values ('Iron set') returning id, owner_id`);
    assert.equal(cat.owner_id, A);
    const item = await one(A, `insert into items (name, category_id) values ('Isolation test item', $1) returning id`, [cat.id]);

    assert.equal(n((await one(B, 'select count(*) as c from items')).c), 0);
    assert.equal(n((await one(B, 'select count(*) as c from item_costs')).c), 0);
    assert.equal(n((await one(B, 'select count(*) as c from categories')).c), 0);

    assert.equal(await affected(B, `update items set name = 'hijacked' where id = $1`, [item.id]), 0);
    assert.equal(await affected(B, `delete from items where id = $1`, [item.id]), 0);
    await assert.rejects(
      all(B, `insert into items (owner_id, name) values ($1, 'planted')`, [A]),
      /row-level security/,
    );
    // Moving your own row to someone else is blocked too.
    assert.equal(await affected(B, `insert into categories (name) values ('B cat')`), 1);
    await assert.rejects(all(B, `update categories set owner_id = $1`, [A]), /row-level security/);

    assert.equal((await one(A, 'select name from items where id = $1', [item.id])).name, 'Isolation test item');
    await affected(A, 'delete from items where id = $1', [item.id]);
  });
});

describe('short IDs', () => {
  test('auto-assigned, two characters, unambiguous alphabet', async () => {
    const rows = await all(A, `insert into items (name) select 'Item ' || g from generate_series(1, 20) g returning short_id`);
    const ids = rows.map((r) => r.short_id as string);
    for (const id of ids) assert.match(id, /^[2-9A-HJ-NP-Z]{2}$/);
    assert.equal(new Set(ids).size, ids.length, 'duplicate short IDs');
    await affected(A, `delete from items where name like 'Item %'`);
  });

  test('explicit IDs are upper-cased, unique per owner, and validated', async () => {
    assert.equal((await one(A, `insert into items (name, short_id) values ('Manual', ' k7 ') returning short_id`)).short_id, 'K7');
    await assert.rejects(all(A, `insert into items (name, short_id) values ('Dup', 'K7')`), /duplicate key/);
    await assert.rejects(all(A, `insert into items (name, short_id) values ('Bad', 'O1')`), /check constraint/);
    // Another owner can use the same code.
    assert.equal((await one(B, `insert into items (name, short_id) values ('Theirs', 'K7') returning short_id`)).short_id, 'K7');
    await affected(A, `delete from items where short_id = 'K7'`);
  });

  test('grows to three characters once all 1,024 two-character codes are used', async () => {
    await as(C, async (tx) => {
      await tx.query(`
        insert into items (name, short_id)
        select 'Filler', a.ch || b.ch
        from regexp_split_to_table('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', '') as a(ch),
             regexp_split_to_table('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', '') as b(ch)`);
    });
    assert.equal(n((await one(C, 'select count(*) as c from items')).c), 1024);
    const next = await one(C, `insert into items (name) values ('Overflow') returning short_id`);
    assert.match(next.short_id as string, /^[2-9A-HJ-NP-Z]{3}$/);
  });
});

describe('buy, refurb, sell (Srixon P–5 irons)', () => {
  const ids: Record<string, string> = {};

  test('set up parts, services and a purchase split across three items', async () => {
    await as(A, async (tx) => {
      const q = async (sql: string, p: unknown[] = []) => (await tx.query<Row>(sql, p)).rows[0]!.id as string;
      ids.grip = await q(`insert into part_types (name) values ('Grip') returning id`);
      ids.tape = await q(`insert into part_types (name) values ('Tape') returning id`);
      ids.mcc = await q(
        `insert into parts (part_type_id, name, unit_cost, qty_on_hand, reorder_level) values ($1, 'Golf Pride MCC Std', 8.50, 10, 6) returning id`,
        [ids.grip],
      );
      ids.lamkin = await q(
        `insert into parts (part_type_id, name, unit_cost, qty_on_hand, reorder_level) values ($1, 'Lamkin Crossline', 6.20, 10, 2) returning id`,
        [ids.grip],
      );
      ids.tapeStrip = await q(
        `insert into parts (part_type_id, name, unit_cost, qty_on_hand) values ($1, 'Tape strip', 0.20, 50) returning id`,
        [ids.tape],
      );
      ids.regrip = await q(`insert into services (name, default_minutes, price) values ('Regrip', 10, 12.00) returning id`);
      ids.groove = await q(`insert into services (name, default_minutes, price) values ('Groove sharpen', 15, 10.00) returning id`);
      await tx.query(
        `insert into service_parts (service_id, part_type_id, qty, default_part_id) values ($1, $2, 1, $3), ($1, $4, 1, $5)`,
        [ids.regrip, ids.grip, ids.mcc, ids.tape, ids.tapeStrip],
      );

      ids.purchase = await q(
        `insert into purchases (purchased_on, source, price, postage_in) values ('2026-10-01', 'eBay', 100.00, 10.00) returning id`,
      );
      ids.irons = await q(
        `insert into items (name, contents, purchase_id, allocated_cost) values ('Srixon P–5 irons', '5–PW', $1, 80.00) returning id`,
        [ids.purchase],
      );
      ids.putter = await q(`insert into items (name, purchase_id) values ('Odyssey White Hot #1', $1) returning id`, [ids.purchase]);
      ids.wedge = await q(`insert into items (name, purchase_id) values ('Vokey SM8 56°', $1) returning id`, [ids.purchase]);
    });

    const alloc = await one(A, 'select * from purchase_allocations where purchase_id = $1', [ids.purchase]);
    assert.equal(n(alloc.total_cost), 110);
    assert.equal(n(alloc.allocated_cost), 80);
    assert.equal(n(alloc.unallocated_cost), 30);
    assert.equal(alloc.over_allocated, false);

    // Unallocated £30 is shared equally by the two items without an allocation.
    const putter = await one(A, 'select purchase_share from item_costs where item_id = $1', [ids.putter]);
    assert.equal(n(putter.purchase_share), 15);
  });

  test('work lines default time and price from the service, snapshot part cost, and take stock', async () => {
    const line = await one(
      A,
      `insert into work_lines (item_id, service_id, qty) values ($1, $2, 5) returning id, minutes_each, price_each`,
      [ids.irons, ids.regrip],
    );
    ids.regripLine = line.id as string;
    assert.equal(n(line.minutes_each), 10);
    assert.equal(n(line.price_each), 12);

    const parts = await all(
      A,
      `insert into work_line_parts (work_line_id, part_id, qty) values ($1, $2, 5), ($1, $3, 5) returning unit_cost`,
      [ids.regripLine, ids.mcc, ids.tapeStrip],
    );
    assert.deepEqual(parts.map((p) => n(p.unit_cost)).sort(), [0.2, 8.5]);

    const stock = await all(A, 'select part_id, qty_on_hand, low_stock from part_stock where part_id in ($1, $2)', [ids.mcc, ids.tapeStrip]);
    const byId = Object.fromEntries(stock.map((s) => [s.part_id as string, s]));
    assert.equal(n(byId[ids.mcc!]!.qty_on_hand), 5);
    assert.equal(byId[ids.mcc!]!.low_stock, true, 'MCC 5 left, reorder at 6');
    assert.equal(n(byId[ids.tapeStrip!]!.qty_on_hand), 45);

    // Second service with an extra cost, and a sourced to-find note.
    await one(A, `insert into work_lines (item_id, service_id, extra_cost) values ($1, $2, 2.50) returning id`, [ids.irons, ids.groove]);
    await one(A, `insert into to_find_notes (item_id, description) values ($1, '7-iron, KBS Tour S') returning id`, [ids.irons]);
    await assert.rejects(
      all(A, `update to_find_notes set status = 'sourced' where item_id = $1`, [ids.irons]),
      /check constraint/,
      'sourcing needs a cost',
    );
    await affected(A, `update to_find_notes set status = 'sourced', cost = 15.00, sourced_on = '2026-10-20' where item_id = $1`, [ids.irons]);

    const cost = await one(A, 'select * from item_costs where item_id = $1', [ids.irons]);
    assert.equal(n(cost.purchase_share), 80);
    assert.equal(n(cost.parts_cost), 43.5); // 5 × 8.50 + 5 × 0.20
    assert.equal(n(cost.extras_cost), 2.5);
    assert.equal(n(cost.to_find_cost), 15);
    assert.equal(n(cost.total_cost), 141);
    assert.equal(n(cost.labour_minutes), 65); // 5 × 10 + 15
    assert.equal(n(cost.labour_hours), 1.08);
    assert.equal(cost.labour_cost, null, 'no labour rate set');
    assert.equal(n(cost.open_to_find_count), 0);
  });

  test('restock adds qty at a weighted average cost, without changing past work', async () => {
    const restock = await one(A, `insert into part_restocks (part_id, qty, unit_cost) values ($1, 5, 10.50) returning id`, [ids.mcc]);
    let mcc = await one(A, 'select qty_on_hand, unit_cost from parts where id = $1', [ids.mcc]);
    assert.equal(n(mcc.qty_on_hand), 10);
    assert.equal(n(mcc.unit_cost), 9.5); // (5 × 8.50 + 5 × 10.50) / 10

    const cost = await one(A, 'select parts_cost from item_costs where item_id = $1', [ids.irons]);
    assert.equal(n(cost.parts_cost), 43.5, 'snapshot cost unchanged');

    await assert.rejects(all(A, 'update part_restocks set qty = 6 where id = $1', [restock.id]), /cannot be edited/);

    await affected(A, 'delete from part_restocks where id = $1', [restock.id]);
    mcc = await one(A, 'select qty_on_hand from parts where id = $1', [ids.mcc]);
    assert.equal(n(mcc.qty_on_hand), 5);
  });

  test('swapping or removing parts moves stock back', async () => {
    const line = await one(A, `insert into work_lines (item_id, service_id, qty) values ($1, $2, 1) returning id`, [ids.putter, ids.regrip]);
    const wlp = await one(A, `insert into work_line_parts (work_line_id, part_id, qty) values ($1, $2, 1) returning id`, [line.id, ids.mcc]);
    assert.equal(n((await one(A, 'select qty_on_hand from parts where id = $1', [ids.mcc])).qty_on_hand), 4);

    const swapped = await one(A, 'update work_line_parts set part_id = $2 where id = $1 returning unit_cost', [wlp.id, ids.lamkin]);
    assert.equal(n(swapped.unit_cost), 6.2, 'takes the new part cost');
    assert.equal(n((await one(A, 'select qty_on_hand from parts where id = $1', [ids.mcc])).qty_on_hand), 5);
    assert.equal(n((await one(A, 'select qty_on_hand from parts where id = $1', [ids.lamkin])).qty_on_hand), 9);

    await affected(A, 'delete from work_lines where id = $1', [line.id]);
    assert.equal(n((await one(A, 'select qty_on_hand from parts where id = $1', [ids.lamkin])).qty_on_hand), 10);
  });

  test('sale profit uses actuals, with labour only when a rate is set', async () => {
    const ebay = await one(A, `insert into channels (name, fee_percent) values ('eBay', 12.8) returning id`);
    const sale = await one(
      A,
      `insert into sales (sold_on, channel_id, sale_price, fees, postage_out) values ('2026-11-20', $1, 250.00, 32.00, 10.00) returning id`,
      [ebay.id],
    );
    await one(A, 'insert into sale_items (sale_id, item_id) values ($1, $2) returning sale_id', [sale.id, ids.irons]);

    let p = await one(A, 'select * from sale_profits where sale_id = $1', [sale.id]);
    assert.equal(n(p.items_cost), 141);
    assert.equal(n(p.profit), 67); // 250 − 32 − 10 − 141
    assert.equal(n(p.margin_percent), 26.8);
    assert.equal(p.labour_cost, null);
    assert.equal(p.profit_after_labour, null);
    assert.equal(n(p.days_to_sell), 50);

    const settings = await one(A, `insert into settings (labour_rate) values (30.00) returning aged_stock_days`);
    assert.equal(n(settings.aged_stock_days), 90);

    p = await one(A, 'select * from sale_profits where sale_id = $1', [sale.id]);
    assert.equal(n(p.labour_cost), 32.5); // 65 min at £30/h
    assert.equal(n(p.profit_after_labour), 34.5);
  });

  test('a lot sale adds up the cost of every item in it', async () => {
    const sale = await one(A, `insert into sales (sold_on, sale_price) values ('2026-11-21', 60.00) returning id`);
    await all(A, 'insert into sale_items (sale_id, item_id) values ($1, $2), ($1, $3)', [sale.id, ids.putter, ids.wedge]);
    const p = await one(A, 'select item_count, items_cost, profit from sale_profits where sale_id = $1', [sale.id]);
    assert.equal(n(p.item_count), 2);
    assert.equal(n(p.items_cost), 30);
    assert.equal(n(p.profit), 30);
  });
});

describe("customer service job with the customer's own parts", () => {
  test('charges the service, costs only stock parts, and leaves their grips out of stock', async () => {
    const tapeBefore = n((await one(A, `select qty_on_hand from parts where name = 'Tape strip'`)).qty_on_hand) as number;

    const result = await as(A, async (tx) => {
      const id = async (sql: string, p: unknown[] = []) => (await tx.query<Row>(sql, p)).rows[0]!.id as string;
      const customer = await id(`insert into customers (name, contact) values ('Sam', '07700 900000') returning id`);
      const item = await id(`insert into items (name, customer_id) values ('Customer driver', $1) returning id`, [customer]);
      const job = await id(`insert into jobs (kind, customer_id, title) values ('service', $1, 'Regrip x2') returning id`, [customer]);
      await tx.query('insert into job_items (job_id, item_id) values ($1, $2)', [job, item]);
      const regrip = await id(`select id from services where name = 'Regrip'`);
      const tape = await id(`select id from parts where name = 'Tape strip'`);
      const line = await id(`insert into work_lines (item_id, job_id, service_id, qty) values ($1, $2, $3, 2) returning id`, [item, job, regrip]);
      await tx.query(
        `insert into work_line_parts (work_line_id, part_id, description, qty, customer_supplied)
         values ($1, null, 'Own grips', 2, true), ($1, $2, null, 2, false)`,
        [line, tape],
      );
      return { item, job };
    });

    const totals = await one(A, 'select * from job_totals where job_id = $1', [result.job]);
    assert.equal(n(totals.item_count), 1);
    assert.equal(n(totals.work_charge), 24);
    assert.equal(n(totals.parts_cost), 0.4);
    assert.equal(n(totals.service_profit), 23.6);
    assert.equal(n(totals.labour_minutes), 20);

    const cost = await one(A, 'select purchase_share, parts_cost from item_costs where item_id = $1', [result.item]);
    assert.equal(n(cost.purchase_share), 0);
    assert.equal(n(cost.parts_cost), 0.4);

    assert.equal(n((await one(A, `select qty_on_hand from parts where name = 'Tape strip'`)).qty_on_hand), tapeBefore - 2);

    await assert.rejects(
      all(A, `insert into work_line_parts (work_line_id, qty) select id, 1 from work_lines limit 1`),
      /check constraint/,
      'a part from stock needs a part_id',
    );
  });

  test("a customer's item cannot also come from a purchase", async () => {
    await assert.rejects(
      all(
        A,
        `insert into items (name, customer_id, purchase_id)
         select 'Both', (select id from customers limit 1), (select id from purchases limit 1)`,
      ),
      /check constraint/,
    );
  });
});

describe('log_purchase', () => {
  const D = '00000000-0000-0000-0000-00000000000d';

  before(async () => {
    await db.query(`insert into auth.users (id, email) values ($1, 'd@test')`, [D]);
  });

  test('saves the purchase and its items together, owned by the caller, with short IDs', async () => {
    const cat = await one(D, `insert into categories (name) values ('Putter') returning id`);
    const { purchase_id } = await one(D, 'select log_purchase($1::jsonb, $2::jsonb) as purchase_id', [
      JSON.stringify({ purchased_on: '2026-11-11', source: ' eBay ', price: 120, postage_in: 8.5, notes: '' }),
      JSON.stringify([
        { name: ' Srixon P–5 irons ', category_id: null, contents: '5–PW', condition: 'Good', field_values: {}, allocated_cost: 100 },
        { name: 'Odyssey White Hot #1', category_id: cat.id, contents: '', condition: null, field_values: { a: '34"' }, allocated_cost: null },
      ]),
    ]);

    const purchase = await one(D, 'select owner_id, source, price, postage_in, notes from purchases where id = $1', [purchase_id]);
    assert.equal(purchase.owner_id, D);
    assert.equal(purchase.source, 'eBay');
    assert.equal(purchase.notes, null);

    const items = await all(D, 'select name, short_id, owner_id, contents, field_values from items where purchase_id = $1 order by name', [purchase_id]);
    assert.deepEqual(items.map((i) => i.name), ['Odyssey White Hot #1', 'Srixon P–5 irons']);
    for (const i of items) {
      assert.equal(i.owner_id, D);
      assert.match(i.short_id as string, /^[2-9A-HJ-NP-Z]{2}$/);
    }
    assert.equal(items[0]!.contents, null, 'blank contents stored as null');
    assert.deepEqual(items[0]!.field_values, { a: '34"' });

    const putter = await one(D, `select purchase_share from item_costs where name = 'Odyssey White Hot #1'`);
    assert.equal(n(putter.purchase_share), 28.5); // 128.50 − 100 allocated to the irons
  });

  test('saves nothing if any item is invalid', async () => {
    const before = n((await one(D, 'select count(*) as c from purchases')).c);
    await assert.rejects(
      all(D, 'select log_purchase($1::jsonb, $2::jsonb)', [
        JSON.stringify({ price: 50 }),
        JSON.stringify([{ name: 'Fine' }, { name: '   ' }]),
      ]),
      /check constraint/,
    );
    assert.equal(n((await one(D, 'select count(*) as c from purchases')).c), before);
    assert.equal(n((await one(D, `select count(*) as c from items where name = 'Fine'`)).c), 0);
  });

  test('needs at least one item, and anon cannot call it', async () => {
    await assert.rejects(all(D, `select log_purchase('{}'::jsonb, '[]'::jsonb)`), /at least one item/);
    await assert.rejects(all(null, `select log_purchase('{}'::jsonb, '[{"name":"x"}]'::jsonb)`), /permission denied/);
  });
});
