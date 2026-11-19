-- Votació anònima del Pas d'Equador. Enganxa tot això a Supabase > SQL Editor i prem "Run".
-- Un vot per dispositiu (identificador aleatori que guarda el navegador, sense dades personals).
-- Més un tope de vots per adreça IP perquè ningú pugui inundar la votació des d'una sola connexió
-- (el límit és prou alt perquè una classe sencera pugui votar des de la wifi de la uni).
-- Ni l'identificador ni l'IP es guarden en clar, només hashes.

create table if not exists public.votos (
  dev_hash   text primary key,
  ip_hash    text not null,
  casa       text not null check (casa in ('calgort', 'aliberch', 'molinou')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists votos_ip_idx on public.votos (ip_hash);

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
  return encode(sha256(convert_to(coalesce(ip, 'desconeguda') || ':equador-uab', 'UTF8')), 'hex');
end $$;

create or replace function public.dev_hash_de(p_dev text)
returns text language plpgsql immutable security definer set search_path = public as $$
begin
  if p_dev is null or char_length(p_dev) < 16 or char_length(p_dev) > 80 then
    raise exception 'dispositiu no valid';
  end if;
  return encode(sha256(convert_to(p_dev || ':equador-uab', 'UTF8')), 'hex');
end $$;

-- Deixa o canvia el vot d'aquest dispositiu.
create or replace function public.votar(p_dev text, p_casa text)
returns void language plpgsql security definer set search_path = public as $$
declare
  d text := public.dev_hash_de(p_dev);
  i text := public.ip_hash_actual();
begin
  if p_casa not in ('calgort', 'aliberch', 'molinou') then
    raise exception 'casa no valida';
  end if;
  -- Tope per IP (només si aquest dispositiu encara no tenia vot).
  if not exists (select 1 from public.votos where dev_hash = d)
     and (select count(*) from public.votos where ip_hash = i) >= 40 then
    raise exception 'massa vots des d''aquesta connexio';
  end if;
  insert into public.votos (dev_hash, ip_hash, casa) values (d, i, p_casa)
  on conflict (dev_hash) do update set casa = excluded.casa, updated_at = now();
end $$;

-- Treu el vot d'aquest dispositiu.
create or replace function public.quitar_voto(p_dev text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.votos where dev_hash = public.dev_hash_de(p_dev);
end $$;

-- Quina casa ha votat aquest dispositiu (per mostrar-ho si torna a entrar).
create or replace function public.mi_voto(p_dev text)
returns text language plpgsql stable security definer set search_path = public as $$
begin
  return (select casa from public.votos where dev_hash = public.dev_hash_de(p_dev));
end $$;

-- Vots per casa.
create or replace function public.resultados()
returns table (casa text, n bigint) language sql security definer set search_path = public stable as $$
  select casa, count(*)::bigint from public.votos group by casa;
$$;

revoke all on function public.ip_hash_actual() from public, anon, authenticated;
revoke all on function public.dev_hash_de(text) from public, anon, authenticated;
grant execute on function public.votar(text, text) to anon, authenticated;
grant execute on function public.quitar_voto(text) to anon, authenticated;
grant execute on function public.mi_voto(text)     to anon, authenticated;
grant execute on function public.resultados()      to anon, authenticated;
