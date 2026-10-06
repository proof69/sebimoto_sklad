export function validateConfig(url: string | undefined, key: string | undefined): string | null {
  if (!url || !key || url.includes('YOUR_PROJECT') || key.includes('REPLACE_ME')) {
    return 'Chybí konfigurace Supabase. Nastavte VITE_SUPABASE_URL a VITE_SUPABASE_PUBLISHABLE_KEY podle README a znovu sestavte aplikaci.';
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
      return 'Adresa Supabase musí používat HTTPS.';
    }
  } catch {
    return 'Adresa Supabase není platná URL.';
  }
  if (key.startsWith('sb_secret_')) return 'Do frontendu patří pouze veřejný publishable nebo anon klíč. Nahraďte secret klíč a zneplatněte jej v Supabase.';
  if (!key.startsWith('sb_publishable_')) {
    try {
      const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string };
      if (payload.role !== 'anon') return 'Do frontendu patří pouze veřejný publishable nebo anon klíč.';
    } catch {
      return 'Veřejný klíč Supabase nemá podporovaný formát.';
    }
  }
  return null;
}
