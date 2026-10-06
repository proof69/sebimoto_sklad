# Ověření projektu

Projekt byl vytvořen v `C:\sklad-expedice` a lokálně ověřen 6. 10. 2026.

- Instalace: `npm install` dokončena, lockfile je součástí projektu.
- Runtime pro ověření: Node.js 22.23.3. Systémový Node.js 20.9 je pro současné závislosti příliš starý; použita dočasná verze z npm cache, bez změny systémové instalace.
- `npm run build`: TypeScript a produkční Vite build úspěšné.
- `npm test`: 43 testů prošlo. Hraniční stáří 10 a 14 dní, pořadí, souhrny, český den, validace, CSV a kontrola veřejného klíče.
- Databázová část testů spouští všechny tři migrace ve skutečném PostgreSQL přes PGlite. Ověřuje RLS a grants pro společný plný přístup, skladníkovo CRUD, doplnění chybějících profilů, automatické profily nových účtů, odmítnutí nepřihlášených a anonymních účtů, deaktivaci, skutečného autora/odesílatele, audit a opakované odeslání. Třetí migrace je ověřená vytvořením zakázky pouze s číslem, vymazáním zákazníka při úpravě a zachováním limitu 200 znaků. Deaktivace existující před druhou migrací zůstává zachovaná.
- `npm run test:e2e`: 18 testů prošlo ve Chromium na desktopu, tabletu a mobilu. Přihlášení všech uživatelů do administrace, zachování session po refreshi, odeslání s potvrzením a zrušením, historie, odhlášení, CRUD skladníkem, hledání, prázdný seznam, dark mode a české chyby. Nově ověřeno vytvoření zakázky jen s číslem, pozdější doplnění i vymazání zákazníka a odeslání bez zákazníka.
- Screenshoty přehledu desktopu a mobilu vizuálně zkontrolovány; prohlížečový test také ověřuje absenci vodorovného přetékání.
- Git repository používá větev `main`. Ověřeno ignorování `.env`, lokálního nastavení, buildu a testovacích výstupů.
- Netlify konfigurace obsahuje Node.js 22, build `npm run build`, publish `dist` a SPA fallback pro vnitřní URL.

## Co vyžaduje váš Supabase a nasazení

Veřejná URL a publishable klíč poskytnutého Supabase projektu jsou nastavené v ignorovaném `.env`. Lokální server po změně konfigurace restartoval a produkční build s touto konfigurací prošel. Uživatel potvrdil spuštění migrace v SQL Editoru. Živé Data API potvrzuje existenci `orders` a `profiles` a správně odmítá anonymní SELECT chybou `42501` (HTTP 401). Email přihlášení je zapnuté; veřejná registrace zatím zůstává povolená a pro interní provoz je třeba ji vypnout. Nebyl vytvořen žádný skutečný účet ani zakázka prostřednictvím agenta. Prohlížečové fixtures jsou pouze v testech; produkční kód pracuje výhradně se Supabase.

Nové zadání sjednocuje práva všech přihlášených uživatelů. Frontend byl upraven a druhá migrace `202610060002_shared_access.sql` byla lokálně ověřena. Uživatel potvrdil její spuštění na vzdáleném Supabase v SQL Editoru. Živé přihlášení a autorizované operace následně ověří uživatel vlastním účtem; agent nemá jeho heslo ani privilegovaný klíč.

Živé přihlášení do Supabase po nové migraci, propojení Realtime mezi dvěma uživateli a skutečný Netlify deployment je nutné ověřit podle README. Aplikace bez konfigurace zobrazuje přihlašovací rozhraní s vysvětlením chybějících proměnných a vypnutým přihlášením.

Zákazník je nově nepovinný ve formuláři i v SQL schématu. Třetí migrace `202610060003_optional_customer.sql` byla lokálně ověřená; na vzdáleném Supabase ji musí uživatel spustit v SQL Editoru. Pouze aktualizace frontendu nezmění existující databázové omezení.

Skutečný Netlify deployment není tímto dokumentem potvrzen. README popisuje propojení GitHub repository s Netlify, nastavení prostředí, vytvoření uživatelů se společným přístupem a provozní checklist.
