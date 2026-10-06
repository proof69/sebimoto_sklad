// Skutečný PostgreSQL v PGlite: testujeme všechny migrace, grants, RLS a funkce.
// Pouze auth.users a auth.uid() jsou lokální náhradou infrastruktury Supabase Auth.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const admin = '00000000-0000-0000-0000-000000000001';
const worker = '00000000-0000-0000-0000-000000000002';
const outsider = '00000000-0000-0000-0000-000000000003';
const inactive = '00000000-0000-0000-0000-000000000006';
const orderId = '00000000-0000-0000-0000-000000000011';
const packingItems = [{ code: 'PACK-1', name: 'Produkt k balení', variant: 'A', quantity: 2, produced_quantity: null }];
let db: PGlite;

async function identity(id: string | null, role = 'authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [id ?? '']);
  await db.exec(`set local role ${role}`);
}

describe('databázová bezpečnost', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create table auth.users (
        id uuid primary key, email text,
        raw_user_meta_data jsonb default '{}', is_anonymous boolean default false
      );
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema auth to anon, authenticated;
      create publication supabase_realtime;
    `);
    await db.exec(readFileSync(new URL('../supabase/migrations/202610060001_initial.sql', import.meta.url), 'utf8'));
    await db.query('insert into auth.users(id) values ($1), ($2), ($3), ($4)', [admin, worker, outsider, inactive]);
    await db.query("insert into public.profiles(id, display_name, role) values ($1, 'Správce', 'ADMIN'), ($2, 'Skladník', 'SKLADNIK')", [admin, worker]);
    await db.query("insert into public.profiles(id, display_name, role, is_active) values ($1, 'Deaktivovaný', 'SKLADNIK', false)", [inactive]);
    await db.exec(readFileSync(new URL('../supabase/migrations/202610060002_shared_access.sql', import.meta.url), 'utf8'));
    await db.exec(readFileSync(new URL('../supabase/migrations/202610060003_optional_customer.sql', import.meta.url), 'utf8'));
    await db.exec(readFileSync(new URL('../supabase/migrations/202610060004_pdf_products.sql', import.meta.url), 'utf8'));
    await db.exec(readFileSync(new URL('../supabase/migrations/202610060005_product_packing.sql', import.meta.url), 'utf8'));
  }, 60_000);

  beforeEach(async () => {
    await db.exec('begin');
    await identity(admin);
    await db.query("insert into public.orders(id, order_number, customer, created_at) values ($1, 'ZAK-001', 'Zákazník', now() - interval '17 days')", [orderId]);
  });
  afterEach(async () => { await db.exec('rollback; reset role;'); });
  afterAll(async () => { await db.close(); });

  it('admin může vytvářet, upravovat a mazat', async () => {
    await db.query("update public.orders set customer = 'Nový zákazník' where id = $1", [orderId]);
    expect((await db.query<{ customer: string }>('select customer from public.orders')).rows[0].customer).toBe('Nový zákazník');
    await db.query('delete from public.orders where id = $1', [orderId]);
    expect((await db.query('select * from public.orders')).rows).toHaveLength(0);
  });
  it('zakázku lze vytvořit pouze s číslem a bez zákazníka', async () => {
    const result = await db.query<{ customer: string; created_by: string }>("insert into public.orders(order_number) values ('BEZ-ZAKAZNIKA') returning customer, created_by");
    expect(result.rows[0]).toEqual({ customer: '', created_by: admin });
  });
  it('zákazníka lze vymazat při úpravě existující zakázky', async () => {
    const result = await db.query<{ customer: string }>("update public.orders set customer = '' where id = $1 returning customer", [orderId]);
    expect(result.rows[0].customer).toBe('');
  });
  it('nepovinný zákazník stále respektuje limit 200 znaků', async () => {
    await expect(db.query("insert into public.orders(order_number, customer) values ('DLOUHY-ZAKAZNIK', $1)", ['x'.repeat(201)])).rejects.toMatchObject({ code: '23514' });
  });
  it('produkty a údaje PDF se ukládají se stejnou RLS ochranou a přežijí odeslání', async () => {
    await identity(worker);
    const items = [{ code: 'TEST-001', name: 'Testovací produkt', variant: 'A', quantity: 2, produced_quantity: null }];
    const inserted = await db.query<{ id: string }>("insert into public.orders (order_number, products, source_order_number, customer_code, requested_ship_date, source_file_name) values ('PDF-001', $1::jsonb, 'OBJ-001', 'CUSTOMER-1', '2026-10-05', 'test.pdf') returning id", [JSON.stringify(items)]);
    const shipped = await db.query<{ products: unknown; source_order_number: string; shipped_by: string }>('select * from public.ship_order($1)', [inserted.rows[0].id]);
    expect(shipped.rows[0].products).toEqual(items);
    expect(shipped.rows[0].source_order_number).toBe('OBJ-001');
    expect(shipped.rows[0].shipped_by).toBe(worker);
  });
  it.each([0, -1, 1.5])('databáze odmítne neplatné množství produktu %s', async quantity => {
    const items = [{ code: '', name: 'Produkt', variant: '', quantity, produced_quantity: null }];
    await expect(db.query("insert into public.orders (order_number, products) values ('BAD-PRODUCT', $1::jsonb)", [JSON.stringify(items)])).rejects.toMatchObject({ code: '23514' });
  });
  it('databáze odmítne produkt bez názvu', async () => {
    await expect(db.query("insert into public.orders (order_number, products) values ('BAD-PRODUCT', '[{\"code\":\"A\",\"name\":\"\",\"variant\":\"\",\"quantity\":1,\"produced_quantity\":null}]')")).rejects.toMatchObject({ code: '23514' });
  });
  async function preparePacking() {
    await db.query('update public.orders set products = $1::jsonb where id = $2', [JSON.stringify(packingItems), orderId]);
    await identity(worker);
  }
  async function packPiece(delta: number, index = 0, expected = packingItems[0]) {
    return db.query<{ products: { packed_quantity?: number }[] }>('select * from public.pack_product($1, $2, $3, $4::jsonb)', [orderId, index, delta, JSON.stringify(expected)]);
  }
  it('přičítá kusy atomicky i se starým klientským počtem a umožní opravu mínusem', async () => {
    await preparePacking();
    expect((await packPiece(1)).rows[0].products[0].packed_quantity).toBe(1);
    // Stejný původní produkt bez packed_quantity: druhý skladník neodečte první změnu.
    expect((await packPiece(1)).rows[0].products[0].packed_quantity).toBe(2);
    expect((await packPiece(-1)).rows[0].products[0].packed_quantity).toBe(1);
  });
  it('nelze zabalit více kusů, než je objednáno', async () => {
    await preparePacking(); await packPiece(1); await packPiece(1);
    await expect(packPiece(1)).rejects.toMatchObject({ code: 'P0005' });
  });
  it('nelze odebrat kus pod nulu', async () => {
    await preparePacking();
    await expect(packPiece(-1)).rejects.toMatchObject({ code: 'P0005' });
  });
  it('odmítá zastaralý nebo odstraněný produkt místo změny jiného řádku', async () => {
    await preparePacking();
    await db.query("update public.orders set products = jsonb_set(products, '{0,name}', '\"Změněný produkt\"') where id = $1", [orderId]);
    await expect(packPiece(1)).rejects.toMatchObject({ code: 'P0004' });
  });
  it('po odeslání nelze měnit balení, ale jeho stav zůstane v historii', async () => {
    await preparePacking(); await packPiece(1);
    const shipped = await db.query<{ products: { packed_quantity: number }[] }>('select * from public.ship_order($1)', [orderId]);
    expect(shipped.rows[0].products[0].packed_quantity).toBe(1);
    await expect(packPiece(1)).rejects.toMatchObject({ code: 'P0003' });
  });
  it('nepřihlášený nemůže měnit balení přes RPC', async () => {
    await preparePacking(); await identity(null, 'anon');
    await expect(packPiece(1)).rejects.toMatchObject({ code: '42501' });
  });
  it('deaktivovaný účet nemůže měnit balení', async () => {
    await preparePacking(); await db.exec('reset role');
    await db.query('update public.profiles set is_active = false where id = $1', [worker]);
    await identity(worker);
    await expect(packPiece(1)).rejects.toMatchObject({ code: '42501' });
  });
  it.each([-1, 3, 0.5])('přímé API nemůže uložit neplatný počet zabalených kusů %s', async packed_quantity => {
    await expect(db.query('update public.orders set products = $1::jsonb where id = $2', [JSON.stringify([{ ...packingItems[0], packed_quantity }]), orderId])).rejects.toMatchObject({ code: '23514' });
  });
  it('nepřihlášený nemůže číst', async () => {
    await identity(null, 'anon');
    await expect(db.query('select * from public.orders')).rejects.toMatchObject({ code: '42501' });
  });
  it('nepřihlášený nemůže odeslat', async () => {
    await identity(null, 'anon');
    await expect(db.query('select * from public.ship_order($1)', [orderId])).rejects.toMatchObject({ code: '42501' });
  });
  it('skladník smí číst zakázky a profily', async () => {
    await identity(worker);
    expect((await db.query('select * from public.orders')).rows).toHaveLength(1);
    expect((await db.query('select * from public.profiles')).rows).toHaveLength(4);
  });
  it('skladník může vložit přes přímé API a server zaznamená autora', async () => {
    await identity(worker);
    const result = await db.query<{ created_by: string }>("insert into public.orders(order_number, customer) values ('SKLAD-002', 'Nová zakázka') returning created_by");
    expect(result.rows[0].created_by).toBe(worker);
  });
  it('skladník může měnit údaje a stav přes přímé API', async () => {
    await identity(worker);
    const result = await db.query<{ customer: string; status: string; shipped_by: string }>("update public.orders set customer = 'Upravený zákazník', status = 'shipped' returning customer, status, shipped_by");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({ customer: 'Upravený zákazník', status: 'shipped', shipped_by: worker });
  });
  it('skladník může smazat přes přímé API', async () => {
    await identity(worker);
    expect((await db.query('delete from public.orders returning *')).rows).toHaveLength(1);
    expect((await db.query('select * from public.orders')).rows).toHaveLength(0);
  });
  it('skladník nemůže změnit svoji roli', async () => {
    await identity(worker);
    await expect(db.query("update public.profiles set role = 'ADMIN' where id = $1", [worker])).rejects.toMatchObject({ code: '42501' });
  });
  it('ani frontend admina nemůže přidělovat role', async () => {
    await expect(db.query("update public.profiles set role = 'ADMIN' where id = $1", [worker])).rejects.toMatchObject({ code: '42501' });
  });
  it('migrace doplní profil existujícímu účtu bez ručního přiřazení role', async () => {
    await identity(outsider);
    expect((await db.query('select * from public.orders')).rows).toHaveLength(1);
    expect((await db.query<{ role: string }>('select role from public.profiles where id = $1', [outsider])).rows[0].role).toBe('ADMIN');
  });
  it('doplněný účet může volat odesílací funkci', async () => {
    await identity(outsider);
    const result = await db.query<{ shipped_by: string }>('select * from public.ship_order($1)', [orderId]);
    expect(result.rows[0].shipped_by).toBe(outsider);
  });
  it('nový Auth účet automaticky získá aktivní profil a plný přístup', async () => {
    const newId = '00000000-0000-0000-0000-000000000004';
    await db.exec('reset role');
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'novy@example.cz', $2)", [newId, { display_name: 'Nový skladník', role: 'SKLADNIK', is_active: false }]);
    await identity(newId);
    const profile = await db.query<{ display_name: string; role: string; is_active: boolean }>('select display_name, role, is_active from public.profiles where id = $1', [newId]);
    expect(profile.rows[0]).toEqual({ display_name: 'Nový skladník', role: 'ADMIN', is_active: true });
    await db.query("insert into public.orders(order_number, customer) values ('NEW-USER', 'Nový zákazník')");
    expect((await db.query('select * from public.orders')).rows).toHaveLength(2);
  });
  it('historický sloupec SKLADNIK už neomezuje práva', async () => {
    await db.exec('reset role');
    await db.query("update public.profiles set role = 'SKLADNIK' where id = $1", [worker]);
    await identity(worker);
    expect((await db.query<{ role: string }>('select public.current_role() as role')).rows[0].role).toBe('ADMIN');
    await db.query("insert into public.orders(order_number, customer) values ('LEGACY', 'Zákazník')");
  });
  it('anonymní Supabase Auth účet nezíská profil ani plný přístup', async () => {
    const anonymousId = '00000000-0000-0000-0000-000000000005';
    await db.exec('reset role');
    await db.query('insert into auth.users(id, is_anonymous) values ($1, true)', [anonymousId]);
    await identity(anonymousId);
    expect((await db.query('select * from public.profiles where id = $1', [anonymousId])).rows).toHaveLength(0);
    expect((await db.query('select * from public.orders')).rows).toHaveLength(0);
    await expect(db.query('select * from public.ship_order($1)', [orderId])).rejects.toMatchObject({ code: '42501' });
  });
  it('migrace zachová dříve deaktivovaný účet a jeho jméno', async () => {
    await identity(inactive);
    expect((await db.query<{ display_name: string; is_active: boolean }>('select display_name, is_active from public.profiles where id = $1', [inactive])).rows[0]).toEqual({ display_name: 'Deaktivovaný', is_active: false });
    expect((await db.query('select * from public.orders')).rows).toHaveLength(0);
  });
  it('odesílací funkce nastaví přesný čas a skutečného skladníka', async () => {
    await identity(worker);
    const result = await db.query<{ status: string; shipped_by: string; shipped_at: Date; created_by: string }>('select * from public.ship_order($1)', [orderId]);
    expect(result.rows[0].status).toBe('shipped');
    expect(result.rows[0].shipped_by).toBe(worker);
    expect(result.rows[0].created_by).toBe(admin);
    expect(result.rows[0].shipped_at).toBeInstanceOf(Date);
    expect(Math.abs(Date.now() - result.rows[0].shipped_at.getTime())).toBeLessThan(5000);
  });
  it('opakované odeslání nezmění prvního odesílatele', async () => {
    await identity(worker);
    await db.query('select * from public.ship_order($1)', [orderId]);
    await identity(admin);
    await expect(db.query('select * from public.ship_order($1)', [orderId])).rejects.toMatchObject({ code: 'P0001' });
  });
  it('deaktivovaný účet nevidí data a nemůže odesílat ani se starým JWT', async () => {
    await db.exec('reset role');
    await db.query('update public.profiles set is_active = false where id = $1', [worker]);
    await identity(worker);
    expect((await db.query('select * from public.orders')).rows).toHaveLength(0);
    await expect(db.query('select * from public.ship_order($1)', [orderId])).rejects.toMatchObject({ code: '42501' });
  });
  it('admin nemůže podvrhnout autora ani metadata odeslání', async () => {
    await db.query('update public.orders set created_by = $1 where id = $2', [worker, orderId]);
    expect((await db.query<{ created_by: string }>('select created_by from public.orders')).rows[0].created_by).toBe(admin);
    await db.query("update public.orders set status = 'shipped', shipped_by = $1, shipped_at = now() - interval '2 days' where id = $2", [worker, orderId]);
    expect((await db.query<{ shipped_by: string }>('select shipped_by from public.orders')).rows[0].shipped_by).toBe(admin);
  });
  it('admin může znovu otevřít zakázku; audit zachová původní odeslání', async () => {
    await identity(worker);
    await db.query('select * from public.ship_order($1)', [orderId]);
    await identity(admin);
    await db.query("update public.orders set status = 'pending' where id = $1", [orderId]);
    const result = await db.query<{ status: string; shipped_by: string | null; shipped_at: Date | null }>('select status, shipped_by, shipped_at from public.orders');
    expect(result.rows[0]).toEqual({ status: 'pending', shipped_by: null, shipped_at: null });
    await db.exec('reset role');
    const events = await db.query<{ actor_id: string; new_record: { status: string } }>("select actor_id, new_record from private.order_events where new_record->>'status' = 'shipped'");
    expect(events.rows[0].actor_id).toBe(worker);
  });
  it('klient nemůže číst soukromý audit', async () => {
    await expect(db.query('select * from private.order_events')).rejects.toMatchObject({ code: '42501' });
  });
  it('odmítá datum vytvoření v budoucnosti', async () => {
    await expect(db.query("insert into public.orders(order_number, customer, created_at) values ('FUTURE', 'A', now() + interval '1 day')")).rejects.toMatchObject({ code: '23514' });
  });
  it('číslo zakázky je unikátní bez ohledu na velikost písmen a mezery', async () => {
    await expect(db.query("insert into public.orders(order_number, customer) values (' zak-001 ', 'A')")).rejects.toMatchObject({ code: '23505' });
  });
});
