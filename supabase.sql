-- Executa aixo a Supabase > SQL Editor
create table if not exists public.productes (
    id    bigint generated always as identity primary key,
    nom   text        not null,
    tipus text        not null check (tipus in ('compra', 'traster')),
    data  timestamptz not null default now(),
    fet   boolean     not null default false
);

alter table public.productes enable row level security;

-- La clau anon es publica (viu al navegador): aquestes politiques decideixen que pot fer.
-- Les insercions les fa la Edge Function (service_role), per aixo no hi ha politica d'insert per a anon.
create policy "anon select" on public.productes for select to anon using (true);
create policy "anon update" on public.productes for update to anon using (true) with check (true);
