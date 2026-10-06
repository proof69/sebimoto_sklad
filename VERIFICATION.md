# Ověření projektu

Projekt byl vytvořen v `C:\sklad-expedice` a lokálně ověřen 6. 10. 2026.

- Instalace: `npm install` dokončena, lockfile je součástí projektu.
- Runtime pro ověření: Node.js 22.23.3. Systémový Node.js 20.9 je pro současné závislosti příliš starý; použita dočasná verze z npm cache, bez změny systémové instalace.
- `npm run build`: TypeScript a produkční Vite build úspěšné.
- `npm test`: 75 testů prošlo. Hraniční stáří 10 a 14 dní, pořadí, souhrny, český den, validace, CSV, veřejný klíč, PDF parser, produkty a průběh přípravy i balení.
- Databázová část testů spouští všechny čtyři migrace ve skutečném PostgreSQL přes PGlite. Ověřuje RLS, společný přístup, automatické profily, deaktivaci, metadata, audit, opakované odeslání a nepovinného zákazníka. Čtvrtá migrace je ověřená vložením produktů a PDF metadat, zachováním produktů po odeslání a odmítnutím prázdných názvů i neplatných množství.
- `npm run test:e2e`: 24 testů prošlo ve Chromium na desktopu, tabletu a mobilu. Přihlášení, CRUD, session, odeslání, historie, hledání, prázdné/chybové stavy, dark mode a nepovinný zákazník. PDF import používá skutečné PDF.js a syntetické PDF bez zákaznických údajů: čtení čísla, původního data a produktů, povinná kontrola, úprava položky, uložení, tabulka produktů a detail metadat. Balení ověřuje plus/minus, meze počítadla, upozornění na chybějící kusy, zachování počtů po refreshi, dokončení a historii bez ovládacích tlačítek.
- Screenshoty přehledu desktopu a mobilu vizuálně zkontrolovány; prohlížečový test také ověřuje absenci vodorovného přetékání.
- Git repository používá větev `main`. Ověřeno ignorování `.env`, lokálního nastavení, buildu a testovacích výstupů.
- Netlify konfigurace obsahuje Node.js 22, build `npm run build`, publish `dist` a SPA fallback pro vnitřní URL.

## Co vyžaduje váš Supabase a nasazení

Veřejná URL a publishable klíč poskytnutého Supabase projektu jsou nastavené v ignorovaném `.env`. Lokální server po změně konfigurace restartoval a produkční build s touto konfigurací prošel. Uživatel potvrdil spuštění migrace v SQL Editoru. Živé Data API potvrzuje existenci `orders` a `profiles` a správně odmítá anonymní SELECT chybou `42501` (HTTP 401). Email přihlášení je zapnuté; veřejná registrace zatím zůstává povolená a pro interní provoz je třeba ji vypnout. Nebyl vytvořen žádný skutečný účet ani zakázka prostřednictvím agenta. Prohlížečové fixtures jsou pouze v testech; produkční kód pracuje výhradně se Supabase.

Nové zadání sjednocuje práva všech přihlášených uživatelů. Frontend byl upraven a druhá migrace `202610060002_shared_access.sql` byla lokálně ověřena. Uživatel potvrdil její spuštění na vzdáleném Supabase v SQL Editoru. Živé přihlášení a autorizované operace následně ověří uživatel vlastním účtem; agent nemá jeho heslo ani privilegovaný klíč.

Živé přihlášení do Supabase po nové migraci, propojení Realtime mezi dvěma uživateli a skutečný Netlify deployment je nutné ověřit podle README. Aplikace bez konfigurace zobrazuje přihlašovací rozhraní s vysvětlením chybějících proměnných a vypnutým přihlášením.

Zákazník je nově nepovinný ve formuláři i v SQL schématu. Třetí migrace `202610060003_optional_customer.sql` byla lokálně ověřená; na vzdáleném Supabase ji musí uživatel spustit v SQL Editoru. Pouze aktualizace frontendu nezmění existující databázové omezení.

## Ověření PDF importu

Uživatelem dodaný vzor `pdf/24189.pdf` byl lokálně přečten a vizuálně zkontrolován. Stejný produkční parser s PDF.js načetl číslo zakázky i objednávky, kód zákazníka, šest produktů a šest kusů. Datum „Založeno“ 5. 10. 2026 převádí na půlnoc `Europe/Prague`; datum vytištění 6. 10. 2026 neovlivňuje stáří. Jméno autora z PDF nepřepisuje skutečného přihlášeného autora v databázi.

Vzorové PDF ani jeho osobní údaje nejsou součástí repository. Git ignoruje vstupní složku `pdf/` i pomocné náhledy. Screenshoty přehledu s produkty z prohlížečových testů byly vizuálně zkontrolované na desktopu i mobilu.

Pro produkční ukládání produktů je potřeba na Supabase spustit `202610060004_pdf_products.sql`. Ta zároveň umožní nepovinného zákazníka, pokud třetí migrace ještě nebyla spuštěna. Soubor PDF se nikam nenahrává; do databáze se ukládají až uživatelem potvrzené údaje. Naskenované PDF bez textu není podporované.

Skutečný Netlify deployment není tímto dokumentem potvrzen. README popisuje propojení GitHub repository s Netlify, nastavení prostředí, vytvoření uživatelů se společným přístupem a provozní checklist.

## Ověření balení produktů

Aktuální testy spouštějí šest migrací včetně `202610060006_product_preparation.sql`. Nové testy ověřují nezávislá počítadla, střídání přípravy a balení se zastaralým klientským produktem, meze připravených kusů, databázový CHECK, zákaz operací deaktivovanému a anonymnímu účtu, změněný produkt a odeslanou zakázku. Prohlížečový scénář přípravy a balení ověřuje oba kroky, opravu mínusem, zachování připraveného počtu při balení, refresh a historii na třech velikostech obrazovky. Šestou migraci musí uživatel spustit na vzdáleném Supabase po páté migraci; vzdálená instalace agentem nebyla provedena.

Databázové testy nyní spouštějí všech pět migrací. Pátá ověřuje přičítání ze serverového počtu i se zastaralým klientským počtem, odečítání, dolní a horní meze, odmítnutí změněného produktu, odeslané zakázky a anonymního/deaktivovaného účtu. Přímý zápis neplatného počtu přes API odmítá databázový CHECK. Chybějící `packed_quantity` znamená nulu, takže staré zakázky není nutné přepisovat.

Screenshoty balení byly vizuálně ověřeny na desktopu a mobilu; na mobilu jsou produkty v kartách s velkými tlačítky + a −. Prohlížečové testy potvrzují absenci vodorovného přetékání. Odeslání neúplného balení zůstává možné po upozornění.

Migraci `202610060005_product_packing.sql` musí uživatel spustit v SQL Editoru vzdáleného Supabase po čtvrté migraci. Agent nemá privilegované přihlašovací údaje a její nasazení na vzdáleném projektu zatím není potvrzené. Skutečné souběžné balení dvěma uživateli a Realtime je třeba ověřit na živém projektu; lokální testy ověřují databázovou funkci a rozhraní odděleně.
