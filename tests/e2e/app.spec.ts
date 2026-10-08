// Síťové fixtures jsou výhradně v testech. Produkce používá pouze Supabase.
// Bezpečnost RLS se ověřuje odděleně proti PostgreSQL v database.test.ts.
import { expect, test, type Page } from '@playwright/test';
import type { Order, OrderView, Profile, Role } from '../../src/types';
import { DAY_MS } from '../../src/lib/orders';
import { samplePdf } from './pdf-fixture';

const adminId = '00000000-0000-0000-0000-000000000001';
const workerId = '00000000-0000-0000-0000-000000000002';

async function fixtures(page: Page, role: Role, options: { empty?: boolean; failure?: boolean } = {}) {
  const id = role === 'ADMIN' ? adminId : workerId;
  const views: OrderView[] = [{ order_id: '00000000-0000-0000-0000-000000000100', user_id: adminId, viewed_at: new Date().toISOString() }];
  const people: Profile[] = [
    { id: adminId, display_name: 'Eva Správcová', role: 'ADMIN', is_active: true },
    { id: workerId, display_name: 'Jan Skladník', role: 'SKLADNIK', is_active: true },
  ];
  let rows: Order[] = options.empty ? [] : [17, 11, 2].map((days, index) => ({
    id: `00000000-0000-0000-0000-${String(100 + index).padStart(12, '0')}`,
    order_number: `ZAK-${index + 1}`, customer: ['Moravské dílny', 'Ateliér Praha', 'Studio Brno'][index],
    note: index === 0 ? 'Pečlivě zabalit. Křehké zboží.' : '', created_at: new Date(Date.now() - days * DAY_MS).toISOString(),
    updated_at: new Date(Date.now()).toISOString(), status: 'pending', shipped_at: null, created_by: adminId, shipped_by: null,
    products: [], source_order_number: '', customer_code: '', requested_ship_date: null, source_file_name: '',
  }));
  const token = `${btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${btoa(JSON.stringify({ sub: id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated' }))}.test-signature`;
  const user = { id, email: 'uzivatel@example.cz', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() };
  await page.routeWebSocket('ws://127.0.0.1:54321/**', socket => { socket.close(); });
  await page.route('http://127.0.0.1:54321/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const send = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.endsWith('/token')) return send({ access_token: token, refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user });
    if (url.pathname.endsWith('/user')) return send(user);
    if (url.pathname.endsWith('/logout')) return send({});
    if (url.pathname.endsWith('/order_views')) return send(views);
    if (url.pathname.endsWith('/rpc/mark_order_viewed')) {
      const orderId = request.postDataJSON().p_order_id;
      if (!rows.some(o => o.id === orderId)) return send({ code: 'P0002' }, 404);
      let viewed = views.find(v => v.order_id === orderId && v.user_id === id);
      if (!viewed) { viewed = { order_id: orderId, user_id: id, viewed_at: new Date().toISOString() }; views.push(viewed); }
      return send(request.headers().accept?.includes('object+json') ? viewed : [viewed]);
    }
    if (url.pathname.endsWith('/profiles')) {
      const selected = url.searchParams.get('id')?.replace('eq.', '');
      const data = selected ? people.filter(p => p.id === selected) : people;
      return send(request.headers().accept?.includes('object+json') ? data[0] : data);
    }
    if (url.pathname.endsWith('/rpc/ship_order')) {
      const selected = rows.find(o => o.id === request.postDataJSON().p_order_id);
      if (!selected) return send({ code: 'P0002', message: 'Order not found' }, 404);
      selected.status = 'shipped';
      selected.shipped_at = new Date().toISOString();
      selected.shipped_by = id;
      selected.updated_at = new Date().toISOString();
      return send(request.headers().accept?.includes('object+json') ? selected : [selected]);
    }
    if (url.pathname.endsWith('/rpc/pack_product') || url.pathname.endsWith('/rpc/prepare_product')) {
      const body = request.postDataJSON();
      const selected = rows.find(o => o.id === body.p_order_id);
      if (!selected) return send({ code: 'P0002' }, 404);
      if (selected.status !== 'pending') return send({ code: 'P0003' }, 400);
      const product = selected.products[body.p_product_index];
      if (!product) return send({ code: 'P0004' }, 400);
      const field = url.pathname.endsWith('/rpc/prepare_product') ? 'prepared_quantity' : 'packed_quantity';
      const next = (product[field] ?? 0) + body.p_delta;
      if (next < 0 || next > product.quantity) return send({ code: 'P0005' }, 400);
      product[field] = next;
      selected.updated_at = new Date().toISOString();
      return send(request.headers().accept?.includes('object+json') ? selected : [selected]);
    }
    if (url.pathname.endsWith('/orders')) {
      if (options.failure) return send({ code: '42501', message: 'denied' }, 403);
      if (request.method() === 'POST') {
        const payload = request.postDataJSON();
        const created: Order = { ...payload, id: '00000000-0000-0000-0000-000000000999', created_at: payload.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString(), status: 'pending', created_by: id, shipped_by: null, shipped_at: null };
        rows.push(created);
        return send(request.headers().accept?.includes('object+json') ? created : [created], 201);
      }
      const selectedId = url.searchParams.get('id')?.replace('eq.', '');
      if (request.method() === 'DELETE') {
        const removed = rows.filter(o => o.id === selectedId);
        rows = rows.filter(o => o.id !== selectedId);
        return send(removed.map(o => ({ id: o.id })));
      }
      if (request.method() === 'PATCH') {
        const selected = rows.find(o => o.id === selectedId);
        if (selected) Object.assign(selected, request.postDataJSON(), { updated_at: new Date().toISOString() });
        return send(request.headers().accept?.includes('object+json') ? selected : [selected]);
      }
      return send(rows);
    }
    return send({});
  });
}

async function login(page: Page) {
  await page.goto('/prihlaseni');
  await page.getByLabel('E-mail', { exact: true }).fill('uzivatel@example.cz');
  await page.getByLabel('Heslo', { exact: true }).fill('bezpecne-testovaci-heslo');
  await page.getByRole('button', { name: 'Přihlásit se', exact: true }).click();
}

test('zobrazení detailu ukáže kolegy i vlastní stav a přežije refresh', async ({ page }) => {
  await fixtures(page, 'SKLADNIK'); await login(page);
  const card = page.locator('.order-card').filter({ has: page.getByRole('button', { name: 'ZAK-1', exact: true }) }).first();
  await expect(card).toContainText('Pro vás nové');
  await expect(card).toContainText('Eva Správcová');
  await card.getByRole('button', { name: 'ZAK-1', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Jan Skladník (vy)');
  await page.getByRole('button', { name: 'Zavřít detail', exact: true }).click();
  await expect(card).toContainText('Už jste viděl(a)');
  await page.reload();
  await expect(card).toContainText('Už jste viděl(a)');
  await expect(page.locator('.order-card').nth(1)).toContainText('Pro vás nové');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('nepřihlášený nevidí zakázky ani při otevření vnitřní URL', async ({ page }) => {
  await fixtures(page, 'SKLADNIK');
  await page.goto('/administrace');
  await expect(page).toHaveURL(/prihlaseni/);
  await expect(page.getByRole('button', { name: 'Přihlásit se', exact: true })).toBeVisible();
  await expect(page.getByText('Moravské dílny')).toHaveCount(0);
});

test('každý přihlášený vidí administraci, priority a může odesílat', async ({ page }, info) => {
  await fixtures(page, 'SKLADNIK');
  await login(page);
  await expect(page).toHaveURL(/administrace/);
  const cards = page.locator('.order-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toContainText('ZAK-1');
  await expect(cards.first()).toContainText('PO TERMÍNU');
  await expect(page.getByRole('link', { name: 'Administrace', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nová zakázka' })).toBeVisible();
  await expect(page.locator('body')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('prehled-skladu.png'), fullPage: true });
  await cards.first().getByRole('button', { name: 'Označit jako odesláno' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Zrušit', exact: true }).click();
  await expect(cards).toHaveCount(3);
  await cards.first().getByRole('button', { name: 'Označit jako odesláno' }).click();
  await page.getByRole('button', { name: 'Ano, označit jako odesláno', exact: true }).click();
  await expect(page.getByText('Zakázka byla označena jako odeslaná.', { exact: true })).toBeVisible();
  await expect(cards).toHaveCount(2);
  await page.getByRole('link', { name: 'Historie odeslání' }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Jan Skladník');
  await expect(cards.first()).not.toContainText('PO TERMÍNU');
  await page.reload();
  await expect(cards).toHaveCount(1);
  await expect(page).toHaveURL(/historie/);
  await page.goto('/administrace');
  await expect(page).toHaveURL(/administrace/);
  await page.getByRole('button', { name: 'Odhlásit se', exact: true }).click();
  await expect(page).toHaveURL(/prihlaseni/);
});

test('také skladník vytváří, hledá, upravuje a maže s potvrzením', async ({ page }) => {
  await fixtures(page, 'SKLADNIK');
  await login(page);
  await expect(page).toHaveURL(/administrace/);
  await page.getByRole('button', { name: 'Nová zakázka', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Číslo zakázky', { exact: false }).fill('ZAK-NOVA');
  await page.getByRole('dialog').getByLabel(/^Zákazník\b/).fill('Nový zákazník');
  await page.getByRole('dialog').getByLabel('Poznámka', { exact: false }).fill('Pokyny k balení');
  await page.getByRole('button', { name: 'Vytvořit zakázku', exact: true }).click();
  await expect(page.getByText('Nová zakázka byla vytvořena.', { exact: true })).toBeVisible();
  await page.getByRole('searchbox').fill('novy');
  await expect(page.locator('.order-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Upravit zakázku ZAK-NOVA', exact: true }).click();
  await page.getByRole('dialog').getByLabel(/^Zákazník\b/).fill('Nový zákazník upravený');
  await page.getByRole('button', { name: 'Uložit změny', exact: true }).click();
  await expect(page.locator('.order-card')).toContainText('Nový zákazník upravený');
  await page.getByRole('button', { name: 'Odstranit zakázku ZAK-NOVA', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Zrušit', exact: true }).click();
  await expect(page.locator('.order-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Odstranit zakázku ZAK-NOVA', exact: true }).click();
  await page.getByRole('button', { name: 'Odstranit zakázku', exact: true }).click();
  await expect(page.getByText('Žádné zakázky k zobrazení', { exact: true })).toBeVisible();
});

test('prázdný seznam a tmavý režim', async ({ page }, info) => {
  await fixtures(page, 'SKLADNIK', { empty: true });
  await login(page);
  await expect(page.getByText('Žádné zakázky k zobrazení', { exact: true })).toBeVisible();
  const themeButton = info.project.name === 'desktop' ? page.getByRole('button', { name: /Tmavý režim|Světlý režim/ }) : page.getByRole('button', { name: /Zapnout tmavý režim|Zapnout světlý režim/ });
  const initial = await page.locator('html').getAttribute('data-theme');
  await themeButton.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', initial === 'dark' ? 'light' : 'dark');
});

test('zakázku lze vytvořit jen s číslem a zákazníka doplnit nebo vymazat', async ({ page }) => {
  await fixtures(page, 'SKLADNIK');
  await login(page);
  await page.getByRole('button', { name: 'Nová zakázka', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Číslo zakázky', { exact: false }).fill('ZAK-BEZ-ZAKAZNIKA');
  await expect(page.getByRole('dialog').getByLabel(/^Zákazník\b/)).not.toHaveAttribute('required', '');
  await page.getByRole('button', { name: 'Vytvořit zakázku', exact: true }).click();
  await expect(page.getByText('Nová zakázka byla vytvořena.', { exact: true })).toBeVisible();
  await page.getByRole('searchbox').fill('ZAK-BEZ-ZAKAZNIKA');
  const card = page.locator('.order-card');
  await expect(card).toHaveCount(1);
  await page.getByRole('button', { name: 'Upravit zakázku ZAK-BEZ-ZAKAZNIKA', exact: true }).click();
  await page.getByRole('dialog').getByLabel(/^Zákazník\b/).fill('Doplněný zákazník');
  await page.getByRole('button', { name: 'Uložit změny', exact: true }).click();
  await expect(card).toContainText('Doplněný zákazník');
  await page.getByRole('button', { name: 'Upravit zakázku ZAK-BEZ-ZAKAZNIKA', exact: true }).click();
  await page.getByRole('dialog').getByLabel(/^Zákazník\b/).fill('');
  await page.getByRole('button', { name: 'Uložit změny', exact: true }).click();
  await expect(card).not.toContainText('Doplněný zákazník');
  await card.getByRole('button', { name: 'Označit jako odesláno', exact: true }).click();
  await page.getByRole('button', { name: 'Ano, označit jako odesláno', exact: true }).click();
  await expect(page.getByText('Zakázka byla označena jako odeslaná.', { exact: true })).toBeVisible();
});

test('databázová chyba má české vysvětlení a možnost opakování', async ({ page }) => {
  await fixtures(page, 'SKLADNIK', { failure: true });
  await login(page);
  await expect(page.getByText('Něco se nepodařilo', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zkusit znovu', exact: true })).toBeVisible();
  await expect(page.getByText('K této akci nemáte oprávnění.', { exact: false })).toBeVisible();
});

test('PDF import vyžaduje kontrolu a uloží produkty, čísla i původní datum', async ({ page }, info) => {
  await fixtures(page, 'SKLADNIK');
  await login(page);
  await page.getByRole('button', { name: 'Importovat PDF', exact: true }).click();
  await page.getByLabel('Vybrat PDF zakázky', { exact: true }).setInputFiles({ name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: samplePdf() });
  await expect(page.getByRole('dialog', { name: 'Zkontrolovat import z PDF' })).toBeVisible();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Číslo zakázky', { exact: false })).toHaveValue('PDF-TEST-001');
  await expect(dialog.getByLabel('Číslo objednávky', { exact: true })).toHaveValue('OBJ-001');
  await expect(dialog.getByLabel('Kód zákazníka', { exact: true })).toHaveValue('CUST-001');
  await expect(dialog.getByLabel('Název produktu', { exact: true })).toHaveValue('Testovaci produkt');
  await expect(dialog.getByLabel('Počet kusů', { exact: true })).toHaveValue('2');
  await dialog.getByLabel('Název produktu', { exact: true }).fill('Opravený produkt');
  await page.getByRole('button', { name: 'Vytvořit zakázku', exact: true }).click();
  await expect(page.getByText('Nová zakázka byla vytvořena.', { exact: true })).toBeVisible();
  await page.getByRole('searchbox').fill('PDF-TEST-001');
  await expect(page.locator('.order-card')).toContainText('Kód zákazníka: CUST-001');
  await page.getByRole('searchbox').fill('CUST-001');
  await expect(page.locator('.order-card')).toHaveCount(1);
  await page.locator('.products-summary summary').click();
  await expect(page.locator('.order-card')).toContainText('Už jste viděl(a)');
  await expect(page.locator('.order-card')).toContainText('Jan Skladník (vy)');
  await expect(page.locator('.products-table')).toContainText('Opravený produkt');
  await expect(page.locator('.order-card')).toContainText('5. 10. 2026');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('importovane-produkty.png'), fullPage: true });
  await page.getByRole('button', { name: /PDF-TEST-001/ }).first().click();
  await expect(page.getByRole('dialog')).toContainText('Produkty (1)');
  await expect(page.getByRole('dialog')).toContainText('OBJ-001');
});

test('skladník balí po kusech, vidí co chybí a stav přežije refresh i odeslání', async ({ page }, info) => {
  await fixtures(page, 'SKLADNIK'); await login(page);
  await page.getByRole('button', { name: 'Importovat PDF', exact: true }).click();
  await page.getByLabel('Vybrat PDF zakázky', { exact: true }).setInputFiles({ name: 'packing.pdf', mimeType: 'application/pdf', buffer: samplePdf() });
  await expect(page.getByRole('dialog', { name: 'Zkontrolovat import z PDF' })).toBeVisible();
  await page.getByRole('button', { name: 'Vytvořit zakázku', exact: true }).click();
  await expect(page.getByText('Nová zakázka byla vytvořena.', { exact: true })).toBeVisible();
  await page.getByRole('searchbox').fill('PDF-TEST-001');
  await page.locator('.products-summary summary').click();
  const plus = page.getByRole('button', { name: 'Zabalit jeden kus: Testovaci produkt', exact: true });
  const minus = page.getByRole('button', { name: 'Odebrat zabalený kus: Testovaci produkt', exact: true });
  const preparePlus = page.getByRole('button', { name: 'Připravit jeden kus: Testovaci produkt', exact: true });
  const prepareMinus = page.getByRole('button', { name: 'Odebrat připravený kus: Testovaci produkt', exact: true });
  await expect(prepareMinus).toBeDisabled();
  await preparePlus.click();
  await expect(page.locator('.prepared-cell .packing-value')).toContainText('1 / 2');
  await expect(page.locator('.packed-cell .packing-value')).toContainText('0 / 2');
  await expect(minus).toBeDisabled();
  await plus.click();
  await expect(page.locator('.packed-cell .packing-value')).toContainText('1 / 2');
  await expect(page.getByText('Zbývá zabalit 1 ks.', { exact: true })).toBeVisible();
  await page.locator('.order-card').getByRole('button', { name: 'Označit jako odesláno', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('zbývá zabalit 1 ks');
  await page.getByRole('button', { name: 'Zrušit', exact: true }).click();
  await page.reload();
  await page.getByRole('searchbox').fill('PDF-TEST-001');
  await page.locator('.products-summary summary').click();
  await expect(page.locator('.packed-cell .packing-value')).toContainText('1 / 2');
  await plus.click();
  await expect(page.locator('.prepared-cell .packing-value')).toContainText('1 / 2');
  await preparePlus.click(); await expect(preparePlus).toBeDisabled();
  await prepareMinus.click(); await expect(page.locator('.prepared-cell .packing-value')).toContainText('1 / 2');
  await preparePlus.click(); await expect(page.locator('.prepared-cell .packing-value')).toContainText('2 / 2');
  await expect(page.locator('.packed-cell .packing-value')).toContainText('2 / 2');
  await expect(plus).toBeDisabled();
  await expect(page.getByText('Všechny produkty jsou v bedně.', { exact: true })).toBeVisible();
  await minus.click(); await expect(page.locator('.packed-cell .packing-value')).toContainText('1 / 2');
  await plus.click(); await expect(page.locator('.packed-cell .packing-value')).toContainText('2 / 2');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('baleni-produktu.png'), fullPage: true });
  await page.locator('.order-card').getByRole('button', { name: 'Označit jako odesláno', exact: true }).click();
  await page.getByRole('button', { name: 'Ano, označit jako odesláno', exact: true }).click();
  await expect(page.getByText('Zakázka byla označena jako odeslaná.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Historie odeslání' }).click();
  await page.locator('.products-summary summary').click();
  await expect(page.locator('.packed-cell .packing-value')).toContainText('2 / 2');
  await expect(plus).toHaveCount(0); await expect(minus).toHaveCount(0);
  await expect(preparePlus).toHaveCount(0); await expect(prepareMinus).toHaveCount(0);
  await expect(page.locator('.prepared-cell .packing-value')).toContainText('2 / 2');
});
