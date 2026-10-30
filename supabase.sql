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
create policy "anon insert" on public.productes for insert to anon with check (true);
create policy "anon select" on public.productes for select to anon using (true);
create policy "anon update" on public.productes for update to anon using (true) with check (true);
create policy "anon delete" on public.productes for delete to anon using (true);
