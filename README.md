# Sebimoto expedice — správa skladových zakázek

Česká interní aplikace pro tým skladu. React, TypeScript, Vite, Tailwind CSS a Supabase Auth/PostgreSQL. Statický frontend je připravený pro Netlify. Produkce neobsahuje mock data ani lokální náhradu databáze. Podle aktuálního zadání mají všichni aktivní přihlášení uživatelé stejný plný přístup.

## Co aplikace umí

- Přihlášení e-mailem a heslem, zachování session po refreshi, odhlášení.
- Každý aktivní přihlášený uživatel: vytváření, úpravy, změna stavu, mazání s potvrzením, odesílání, administrace i historie. Není třeba ručně přiřazovat roli.
- Pro novou zakázku stačí její číslo. Zákazník i poznámka jsou nepovinní.
- Import PDF zakázky Sebimoto: číslo zakázky, datum „Založeno“, číslo objednávky, kód zákazníka, informativní termín, popis a produkty. Před uložením se údaje kontrolují a upravují. Produkty lze zadat a upravit i ručně.
- Balení po kusech: u každého produktu tlačítka + a −, uložený počet zabalených kusů, zbývající množství a zelené označení kompletního produktu i zakázky. Při neúplném balení potvrzení odeslání upozorní na chybějící kusy; odeslání lze přesto potvrdit.
- Účty mají vlastní identity pro evidenci autora a odesílatele. Nepřihlášené, deaktivované a anonymní Supabase Auth účty nemají přístup k zakázkám.
- Priority podle skutečného `created_at`: 0–9 dní standardní, 10–13 dní upozornění, 14+ dní červeně po termínu. Odeslané zakázky se nikdy nepočítají jako opožděné.
- Čtyři souhrnné karty, vyhledávání podle čísla/zákazníka i bez diakritiky, filtry, historie, detail a export filtrované historie do CSV.
- Responzivní rozhraní, velká tlačítka, potvrzovací dialogy, toast zprávy, loading/empty/error stavy a dark mode.
- Supabase Realtime; automatické obnovení každých 30 sekund jako záloha a pro smazané záznamy. Po úspěšné mutaci se UI aktualizuje ihned.
- Ochrana proti přepsání souběžné admin úpravy, atomické odeslání se zámkem řádku, soukromý audit.

## Struktura a schéma

```text
src/
  auth/                 session a načítání automaticky vytvořeného profilu
  data/                 Supabase dotazy, mutace, realtime a polling
  components/           layout, formulář, seznam, detail, dialogy, notifikace
  hooks/                automaticky aktualizovaný čas
  lib/                  konfigurace, Supabase klient, stáří, CSV a české chyby
  pages/                přihlášení a přehledy zakázek
  App.tsx               chráněné routy
  types.ts              typy databáze
  styles.css            Tailwind + responzivní styly a témata
supabase/migrations/    produkční SQL schéma, RLS, funkce a audit
tests/                  logika a skutečné PostgreSQL testy
tests/e2e/              prohlížečové testy s izolovanými síťovými fixtures
netlify.toml            build, SPA routing a bezpečnostní hlavičky
```

`public.profiles`: UUID z `auth.users`, zobrazované jméno a aktivita účtu. Historický sloupec `role` zůstává kompatibilní s první migrací, ale po druhé migraci už nerozlišuje oprávnění. Každý aktivní běžný Auth účet má plný přístup. Profily vznikají automaticky; klient je nemůže měnit ani sám reaktivovat deaktivovaný účet.

`public.orders`: UUID, povinné unikátní číslo zakázky (bez ohledu na velikost písmen), nepovinný zákazník a poznámka, `created_at`, `updated_at`, stav `pending` / `shipped`, `shipped_at`, `created_by`, `shipped_by`. Neuvedený zákazník se ukládá jako prázdný řetězec. Všechny časy jsou `timestamptz`. Stáří není uložené. PDF metadata jsou `source_order_number`, `customer_code`, `requested_ship_date` a `source_file_name`. `products` je validované JSONB pole až 200 položek s kódem, názvem, variantou, kladným celým množstvím a volitelným počtem vyrobených kusů; podléhá stejné RLS i auditu jako zakázka.

`private.order_events`: audit vložení, změn a smazání s časem, uživatelem a původním/novým záznamem. Není dostupný frontendovým rolím. Zachová i předchozí odeslání po návratu do čekajících či ručním smazání.

**Definice stáří:** počet celých uplynulých 24hodinových intervalů. Červená priorita začíná přesně po 14 × 24 hodinách. Pravidlo je stejné i přes změnu letního času. České přehledy a „dnes odesláno“ používají `Europe/Prague`; vstup zpětného data používá časovou zónu zařízení, uvedenou u pole. SQL timestampy a session se přenášejí v UTC.

## 1. Vytvoření Supabase projektu

1. Přihlaste se na [supabase.com](https://supabase.com/dashboard) a vytvořte **New project**.
2. Vyberte organizaci, název, silné databázové heslo a vhodný evropský region. Databázové heslo nedávejte do frontendu.
3. Po inicializaci otevřete nahoře **Connect** a vyberte React. Dialog ukáže **Project URL** a veřejný **publishable key** (`sb_publishable_…`). Konkrétní klíče lze také najít v **Settings → API Keys**. Alternativně lze použít starší veřejný `anon` JWT.
4. V **Authentication → Sign In / Providers → Email** povolte přihlášení e-mailem. Pro tento interní systém **vypněte veřejné registrace** (Allow new users to sign up) i anonymní přihlášení. Uživatele přidává správce.
5. Nenechávejte schéma `private` v seznamu schémat vystavených Data API. Používejte `public`.

Rozhraní Supabase může mírně měnit názvy položek; zásadní jsou URL projektu, veřejný klíč, Email provider a vypnutá registrace.

## 2. Spuštění SQL migrací

1. V Supabase otevřete **SQL Editor → New query**.
2. V novém projektu postupně spusťte celý obsah [202610060001_initial.sql](supabase/migrations/202610060001_initial.sql), [202610060002_shared_access.sql](supabase/migrations/202610060002_shared_access.sql), [202610060003_optional_customer.sql](supabase/migrations/202610060003_optional_customer.sql), [202610060004_pdf_products.sql](supabase/migrations/202610060004_pdf_products.sql) a [202610060005_product_packing.sql](supabase/migrations/202610060005_product_packing.sql).
3. V existujícím projektu spusťte **jen migrace, které ještě nebyly provedeny**. První je jednorázová instalace schématu. Druhá převede stávající účty na společný přístup, doplní chybějící profily a nastaví automatické vytváření profilů dalších účtů. Třetí umožní zakázky bez zákazníka. Čtvrtá přidává produkty a PDF metadata a obsahuje také podporu nepovinného zákazníka. Zakázky i stávající zákazníci zůstávají zachovaní a deaktivované účty se znovu nezapnou.
4. V Table Editoru ověřte tabulky `profiles`, `orders` a zapnuté RLS. Veřejné registrace ponechte vypnuté, protože každý nový běžný účet získá plný přístup. Nepovolujte data roli `anon`.
5. Migrace přidává obě veřejné tabulky do existující publikace `supabase_realtime`. Ověřte v **Database → Publications / Replication**, že jsou zahrnuté. Pokud realtime není aktivní, aplikace přesto pracuje a obnovuje data každých 30 sekund.

Používáte-li Supabase CLI, lze tuto migraci také nasadit příkazem `supabase db push` po propojení projektu. Pro samotnou aplikaci není CLI nutné.

## 3. První uživatel s plným přístupem

1. Otevřete **Authentication → Users → Add user → Create new user**.
2. Zadejte skutečný e-mail a silné unikátní heslo. Zapněte potvrzení e-mailu (**Auto confirm user**), pokud účet zakládáte interně bez potvrzovacího e-mailu.
3. Po migracích vznikne profil automaticky. Pokud účet existoval už před druhou migrací, doplní ho druhá migrace. Žádné SQL pro přidělení role není třeba.

Volitelné ověření profilu v SQL Editoru:

```sql
select p.id, p.display_name, p.role, p.is_active
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = lower('admin@vase-firma.cz');
```

Uložte přihlašovací údaje bezpečně. Každý uživatel po přihlášení přejde na `/administrace` a může také používat `/sklad`. Aplikace sama hesla ani Auth účty nevytváří.

## 4. Další uživatel / skladník

Vytvořte dalšího potvrzeného uživatele v **Authentication → Users**. Profil i plný přístup získá automaticky. I skladník může vytvářet, upravovat, mazat a odesílat zakázky. Každý člověk má vlastní účet pro dohledatelnost akcí.

Změna zobrazovaného jména nebo deaktivace patří pouze do důvěryhodného SQL Editoru:

```sql
-- Dosaďte UUID konkrétního uživatele:
update public.profiles set is_active = false where id = 'UUID_UZIVATELE';
-- Případná změna zobrazovaného jména:
update public.profiles set display_name = 'Jan Novák' where id = 'UUID_UZIVATELE';
```

Deaktivovaný účet nemůže číst zakázky ani odesílat ani se starým platným JWT. Profily a Auth uživatele s vazbou na zakázky nemažte; cizí klíče chrání identitu autora/odesílatele. Pro obnovení zapněte `is_active`.

## 5. Environment variables lokálně

Potřebujete **Node.js 22.13+ (řada 22 nebo 24), npm a Git**. Node.js 20.9 není podporován aktuálními závislostmi. Verzi ověřte `node --version`; po instalaci nového Node.js znovu otevřete terminál.

V PowerShellu v projektové složce:

```powershell
Copy-Item .env.example .env
```

V `.env` dosaďte údaje z projektu:

```dotenv
VITE_SUPABASE_URL=https://VAS_PROJEKT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_VAS_VEREJNY_KLIC
```

Soubor `.env` je v `.gitignore`. **Všechny `VITE_` proměnné jsou veřejné a budou v JavaScriptu prohlížeče. Nikdy nepoužívejte `service_role`, `sb_secret_…`, databázové heslo nebo privátní token.** Frontend navíc rozpozná secret klíč a odmítne inicializaci; to není náhrada za bezpečné zacházení s klíči. Pokud jste secret omylem publikovali, zneplatněte jej.

## 6. Instalace a spuštění přes npm

```powershell
cd C:\sklad-expedice
npm install
npm run dev
```

Otevřete URL vypsanou Vite (obvykle `http://localhost:5173`). Přihlaste se účtem vytvořeným v kroku 3 nebo 4. Bez konfigurace uvidíte českou chybovou zprávu, bez účtu přihlášení. Pokud chybí profil, spusťte druhou migraci a v aplikaci zvolte **Zkusit znovu**; profily se doplní automaticky.

```powershell
npm run typecheck
npm test
npm run build
npm run preview
```

Build je v `dist/`. Změna `.env` vyžaduje restart dev serveru; produkce vyžaduje nový build. Pro reprodukovatelnou instalaci podle commitnutého lockfile použijte `npm ci`.

Prohlížečové testy:

```powershell
npx playwright install chromium
npm run test:e2e
```

E2E testy spouštějí vlastní Vite server na portu 4173 a používají síťové fixtures pouze v testech. Nekontaktují váš Supabase. Databázové testy spouštějí **všechny skutečné SQL migrace v PostgreSQL přes PGlite**, testují grants, RLS, společný plný přístup, doplnění starých profilů, automatické profily nových účtů, nepovinného zákazníka, deaktivaci, timestampy, audit a opakované odeslání. Supabase infrastrukturu auth nahrazují pouze minimálním `auth.users` a `auth.uid()`. Plné živé ověření Supabase Auth, WebSocketů a nasazení proveďte checklistem níže na vlastním projektu.

## 7. Git a GitHub

Vytvořte na GitHubu prázdné repository bez automaticky vytvořeného README a zvolte vhodnou viditelnost (pro interní systém obvykle private).

```powershell
git init -b main
git add .
git commit -m "Vytvoreni aplikace pro skladovou expedici"
git remote add origin https://github.com/VAS_UCET/sklad-expedice.git
git push -u origin main
```

Pokud již projekt má Git inicializovaný, první příkaz přeskočte. `node_modules`, `dist`, `.env`, screenshoty a testovací výstupy se necommitují. **Commitujte `package-lock.json` a SQL migrace.** Přihlašování do GitHubu řešte přes Git Credential Manager / GitHub CLI, token nikdy nedávejte do zdrojových souborů.

## 8. Propojení repository s Netlify

1. Přihlaste se na [Netlify](https://app.netlify.com/).
2. Vyberte **Add new project / Import an existing project → GitHub**.
3. Povolte přístup k vybranému repository a vyberte větev `main`.
4. Base directory ponechte prázdné (projekt je v rootu repository).
5. **Build command:** `npm run build`. **Publish directory:** `dist`.
6. Nastavení jsou také v `netlify.toml`; Node.js se nastaví na řadu 22.

## 9. Environment variables na Netlify

Před prvním buildem nastavte v konfiguraci projektu **Environment variables** pro build:

| Proměnná | Hodnota |
| --- | --- |
| `VITE_SUPABASE_URL` | URL vašeho Supabase projektu |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | veřejný publishable key nebo starší `anon` JWT |

Nastavte je pro produkční deploy context; pokud používáte deploy previews, nastavte pro ně vědomě vlastní hodnoty (ideálně oddělený testovací Supabase projekt). Nepřidávejte žádný service role / secret klíč. Proměnné jsou součástí výsledného veřejného bundlu.

V **Supabase → Authentication → URL Configuration** nastavte **Site URL** na finální HTTPS adresu Netlify a mezi povolené redirect URL přidejte přesnou adresu aplikace, případně lokální vývojovou adresu. Aplikace používá přímé přihlášení heslem; sama neposílá recovery ani registrační odkazy.

## 10. Nasazení a ověření

1. Spusťte nasazení tlačítkem **Deploy**. Build provede instalaci závislostí, TypeScript kontrolu a Vite build.
2. Otevřete HTTPS adresu a ověřte přihlášení účtů vašeho týmu a jejich plný přístup.
3. Další push do `main` automaticky vyvolá nové nasazení.
4. Po změně environment variables spusťte nový deploy; již sestavený bundle se nezmění sám.
5. `netlify.toml` má fallback `/* → /index.html` se statusem 200. Refresh `/sklad`, `/administrace` i `/historie` proto funguje. Přístup uvnitř aplikace stále vyžaduje přihlášení a aktivní účet.

Bezpečnostní hlavičky dovolují připojení na standardní `*.supabase.co` přes HTTPS/WSS. Používáte-li vlastní Supabase doménu, doplňte její přesnou HTTPS a WSS adresu do `connect-src` v `netlify.toml` před nasazením.

## Provozní kontrola

- Nepřihlášený návštěvník na `/administrace` dostane přihlášení a žádná data.
- Každý přihlášený uživatel se dostane do administrace a skladu, vytvoří zakázku a ověří její úpravu i mazání s potvrzením. Přímé API operace mají stejná oprávnění jako rozhraní.
- Zakázku lze vytvořit jen s číslem; zákazníka lze později doplnit i vymazat. Číslo zakázky zůstává povinné a unikátní.
- Nově vytvořený běžný Auth účet se přihlásí bez ručního přidělení role. Deaktivovaný ani anonymní účet nemůže měnit zakázky nebo sám reaktivovat profil. Veřejné registrace jsou vypnuté.
- Vytvořte zpětně zakázky se stářím 9, 10, 13, 14 a 17 dní. Zkontrolujte barvy, počty a řazení. Stáří obnovuje timer i po návratu na kartu.
- Zrušte potvrzení odeslání: nic se nezmění. Potvrďte jej: zakázka odejde z aktivních, v historii má přesný čas a skutečného odesílatele. Dvě souběžná potvrzení nepřepíšou prvního uživatele.
- Dva prohlížeče: admin vytvoří zakázku, skladník ji uvidí přes realtime (nebo do 30 sekund při fallbacku).
- Vyzkoušejte šířky 390, 768 a 1440 px, dark mode, prázdný seznam a nedostupné připojení.
- Obnovte vnitřní URL na Netlify a ověřte session po refreshi. Exportujte historii a ověřte české znaky v CSV.
- Ověřte, že v Git repository není `.env`, secret ani osobní přihlašovací údaj.

RLS je hlavní bezpečnostní hranice. Frontendová kontrola přihlášení je pouze UX. `current_role()` ověřuje aktivní neanonymní Auth účet a profil v databázi; po druhé migraci poskytuje všem stejný plný přístup. `ship_order()` nepřijímá datum, user ID ani jiné údaje; zámek a trigger chrání integritu. INSERT/UPDATE/DELETE vyžadují aktivní účet přes RLS a metadata autora/odeslání přepisuje serverový trigger. Profil ani jeho aktivitu nelze měnit klientským API.

Historie není automaticky mazána. Přihlášený uživatel ji může odstranit pouze explicitně s potvrzením; soukromý audit zůstane zachován. Správce má zajistit zálohy Supabase a stanovit retenci auditu podle firemních pravidel. Heslo lze změnit důvěryhodným správcem v Supabase; sdílené skladnické účty nepoužívejte.

Aplikace načítá kompletní seznam po stránkách (nepředpokládá limit API 1 000 řádků), aby souhrny a CSV nebyly neúplné. Seznam vykresluje po 20 položkách. Pro velmi rozsáhlé archivy v řádu stovek tisíc zakázek je další krok serverové filtrování, agregace a export; současná varianta je určená jednoduchému internímu skladu.

## Import PDF a produkty

1. V administraci nebo přehledu skladu klikněte na **Importovat PDF** a vyberte jednu zakázku (nejvýše 15 MB / 25 stran).
2. PDF.js dokument přečte lokálně v prohlížeči. Podporovaný je textový formulář zakázky Sebimoto odpovídající dodanému vzoru. OCR skenů není implementováno; nečitelný, poškozený nebo zaheslovaný dokument dostane české vysvětlení.
3. V náhledu ověřte číslo zakázky, datum a všechny produktové řádky. Počáteční nuly v číslech se zachovají. Čas u dne bez časové složky je 00:00 `Europe/Prague`; upozornění v náhledu tuto volbu uvádí. Datum vytištění „Vytvořeno“ se nepoužívá pro stáří.
4. Pole „Popis“ přejde do poznámky. Zákazník zůstává nepovinný a nevymýšlí se z adresy nebo názvu dodavatele. „Termín“ je informativní; 14denní pravidlo se nemění.
5. Produkty můžete přidat, opravit nebo odstranit. Následně zvolte **Vytvořit zakázku**. U existujícího čísla se import odmítne, aby nepřepsal jiné údaje. PDF s více různými zakázkami se odmítne; importujte je jednotlivě.
6. V seznamu rozbalte **Produkty**, v detailu jsou dostupné položky i PDF metadata. Produkty zůstávají po odeslání v historii a jsou součástí CSV exportu.

Originální PDF se neukládá na Supabase ani na externí službu. Do databáze se uloží pouze potvrzené údaje, produkty a název souboru. Autorem je vždy právě přihlášený uživatel, nikoli jméno vytištěné v PDF. Vzorové dokumenty ve složce `pdf/` jsou ignorované Gitem. PDF.js a worker se načítají až při použití importu; worker je součástí buildu a běží ze stejného webu.

## Balení produktů do bedny

Po instalaci čtvrté migrace spusťte na existujícím Supabase projektu také **pátou migraci `202610060005_product_packing.sql`**. Samotný deploy frontendu databázovou funkci nevytvoří. Pátá migrace zachová všechny zakázky i produkty; starší položky bez `packed_quantity` se počítají jako nula zabalených kusů.

V seznamu rozbalte **Produkty** nebo otevřete detail zakázky. Každé **+** znamená jeden kus vložený do bedny; **−** opraví omyl nebo odebrání kusu. Zobrazuje se například **2 / 5**, **Chybí 3 ks** a celkový průběh zakázky. Po zabalení všech kusů je produkt zelený s potvrzovacím symbolem. Počty se uloží do Supabase, zůstanou po refreshi a ostatní uživatelé je dostanou přes Realtime nebo záložní obnovování.

Funkce `pack_product()` ověřuje aktivní účet, čekající stav a rozsah 0 až požadovaný počet. Pod zámkem řádku přičítá nebo odečítá od aktuálního serverového počtu, takže souběžná kliknutí nepřepisují navzájem svůj postup. Změněný či odstraněný produkt odmítne a klient obnoví data. Balení je součástí soukromého auditu. Formulář nepovolí snížit množství pod už zabalený počet; nejprve kusy odečtěte.

Před odesláním neúplně zabalené zakázky je v potvrzovacím dialogu upozornění s počtem chybějících kusů. Uživatel může odeslání přesto potvrdit. Po odeslání jsou počty v přehledu a detailu pouze ke čtení, zůstávají v historii a exportují se do CSV. Zakázky bez produktů fungují jako dosud.

Pro provozní ověření zkuste produkt s třemi kusy: přidejte dva, obnovte stránku, ověřte 2 / 3, odečtěte jeden a dokončete balení. Zkontrolujte také druhý přihlášený prohlížeč, upozornění před neúplným odesláním a zachování počtů v historii.

## Oficiální dokumentace

- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase API klíče](https://supabase.com/docs/guides/api/api-keys)
- [Supabase Realtime](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Vite na Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/vite/)
- [PDF.js](https://mozilla.github.io/pdf.js/examples/)
