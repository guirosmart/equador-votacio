-- Votació del Pas d'Equador. Enganxa tot això a Supabase > SQL Editor i prem "Run".
-- Es pot executar més d'una vegada sense problemes.

create table if not exists public.votos (
  nombre_norm text primary key,
  nombre      text not null,
  casa        text not null check (casa in ('calgort', 'aliberch', 'molinou')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Ningú pot llegir ni escriure la taula directament des de la web.
-- Només es pot passar per les quatre funcions de sota.
alter table public.votos enable row level security;
revoke all on table public.votos from anon, authenticated;

-- Deixa o canvia el vot d'una persona (un vot per nom).
create or replace function public.votar(p_nombre text, p_casa text)
returns void language plpgsql security definer set search_path = public as $$
declare
  n text := lower(btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g')));
begin
  if char_length(n) < 2 or char_length(n) > 40 then
    raise exception 'nom no valid';
  end if;
  if p_casa not in ('calgort', 'aliberch', 'molinou') then
    raise exception 'casa no valida';
  end if;
  insert into public.votos (nombre_norm, nombre, casa)
  values (n, btrim(p_nombre), p_casa)
  on conflict (nombre_norm) do update set casa = excluded.casa, updated_at = now();
end $$;

-- Treu el vot d'una persona.
create or replace function public.quitar_voto(p_nombre text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.votos
  where nombre_norm = lower(btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g')));
end $$;

-- Diu quina casa ha votat una persona (per recordar-ho si torna a entrar).
create or replace function public.mi_voto(p_nombre text)
returns text language sql security definer set search_path = public stable as $$
  select casa from public.votos
  where nombre_norm = lower(btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g')));
$$;

-- Vots per casa. No mostra cap nom.
create or replace function public.resultados()
returns table (casa text, n bigint) language sql security definer set search_path = public stable as $$
  select casa, count(*)::bigint from public.votos group by casa;
$$;

grant execute on function public.votar(text, text)     to anon, authenticated;
grant execute on function public.quitar_voto(text)     to anon, authenticated;
grant execute on function public.mi_voto(text)         to anon, authenticated;
grant execute on function public.resultados()          to anon, authenticated;

-- Per veure qui ha votat què (només tu, des del panell de Supabase > Table Editor):
--   select nombre, casa, updated_at from public.votos order by updated_at;
