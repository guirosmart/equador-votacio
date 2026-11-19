-- Votació anònima del Pas d'Equador. Enganxa tot això a Supabase > SQL Editor i prem "Run".
-- Un sol vot per adreça IP: si dues persones voten des de la mateixa IP, només en queda un
-- (l'últim). L'IP no es guarda en clar, només un hash.

create table if not exists public.votos (
  ip_hash    text primary key,
  casa       text not null check (casa in ('calgort', 'aliberch', 'molinou')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ningú pot llegir ni escriure la taula directament des de la web.
alter table public.votos enable row level security;
revoke all on table public.votos from anon, authenticated;

-- Hash de l'IP de qui fa la petició (Supabase la posa als headers).
create or replace function public.ip_hash_actual()
returns text language plpgsql stable security definer set search_path = public as $$
declare
  h json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  ip text := nullif(btrim(split_part(coalesce(h->>'cf-connecting-ip', h->>'x-forwarded-for', h->>'x-real-ip', ''), ',', 1)), '');
begin
  if ip is null then raise exception 'ip desconeguda'; end if;
  return encode(sha256(convert_to(ip || ':equador-uab', 'UTF8')), 'hex');
end $$;

-- Deixa o canvia el vot d'aquesta IP.
create or replace function public.votar(p_casa text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_casa not in ('calgort', 'aliberch', 'molinou') then
    raise exception 'casa no valida';
  end if;
  insert into public.votos (ip_hash, casa) values (public.ip_hash_actual(), p_casa)
  on conflict (ip_hash) do update set casa = excluded.casa, updated_at = now();
end $$;

-- Treu el vot d'aquesta IP.
create or replace function public.quitar_voto()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.votos where ip_hash = public.ip_hash_actual();
end $$;

-- Quina casa ha votat aquesta IP (per mostrar-ho si torna a entrar).
create or replace function public.mi_voto()
returns text language plpgsql stable security definer set search_path = public as $$
begin
  return (select casa from public.votos where ip_hash = public.ip_hash_actual());
end $$;

-- Vots per casa.
create or replace function public.resultados()
returns table (casa text, n bigint) language sql security definer set search_path = public stable as $$
  select casa, count(*)::bigint from public.votos group by casa;
$$;

revoke all on function public.ip_hash_actual() from public, anon, authenticated;
grant execute on function public.votar(text)    to anon, authenticated;
grant execute on function public.quitar_voto()  to anon, authenticated;
grant execute on function public.mi_voto()      to anon, authenticated;
grant execute on function public.resultados()   to anon, authenticated;
