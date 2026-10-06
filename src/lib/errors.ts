export function errorMessage(error: unknown): string {
  const value = error as { code?: string; message?: string; status?: number } | null;
  if (value?.code === '23505') return 'Toto číslo zakázky už existuje. Zadejte jiné číslo.';
  if (value?.code === '42501') return 'K této akci nemáte oprávnění. Ověřte, že je váš účet aktivní, nebo se znovu přihlaste.';
  if (value?.code === '23514' || value?.code === '22007') return 'Zkontrolujte vyplněné údaje a datum vytvoření. Datum nesmí být v budoucnosti ani po datu odeslání.';
  if (value?.code === 'P0002') return 'Zakázka už neexistuje nebo k ní nemáte přístup. Obnovte seznam.';
  if (value?.code === 'P0001') return 'Zakázka už byla odeslána jiným uživatelem. Obnovte seznam.';
  if (value?.code === 'invalid_credentials') return 'E-mail nebo heslo není správné.';
  if (value?.code === 'email_not_confirmed') return 'E-mail nebyl potvrzen. Obraťte se na správce.';
  if (value?.status === 429 || value?.code === 'over_request_rate_limit') return 'Příliš mnoho pokusů. Zkuste to prosím za chvíli.';
  if (value?.code === '42P01' || value?.code === 'PGRST205' || value?.code === 'PGRST202') return 'Databáze není připravena. Správce musí spustit dodanou SQL migraci.';
  if (value?.message === 'CONFLICT') return 'Zakázku mezitím změnil jiný uživatel. Obnovte seznam a otevřete její aktuální verzi.';
  if (value?.message?.includes('Failed to fetch') || value?.message?.includes('Network')) return 'Spojení se serverem se nezdařilo. Zkontrolujte připojení a zkuste akci znovu.';
  return 'Akci se nepodařilo dokončit. Zkuste ji znovu; pokud problém trvá, kontaktujte správce.';
}
