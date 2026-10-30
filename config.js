// Els valors reals els posa el workflow de GitHub Actions a partir dels secrets
// SUPABASE_URL i SUPABASE_KEY (Settings > Secrets and variables > Actions).
// Per provar en local, substitueix els dos textos __...__ pels teus valors (sense fer commit).
// La clau de Groq NO va aquí: cada persona l'escriu a l'app (⚙).
window.APP_CONFIG = {
    supabaseUrl: '__SUPABASE_URL__',
    supabaseKey: '__SUPABASE_KEY__'
};
