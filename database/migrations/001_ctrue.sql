-- Apply once to the Neon database (psql "$DATABASE_URL" -f database/migrations/001_ctrue.sql).
-- user_id is the verified Neon Auth identity as text; Managed Auth's neon_auth schema is never modified.
create table public.accounts (
  user_id text primary key,
  balance_seconds bigint not null default 600 check (balance_seconds >= 0),
  plan text not null default 'trial', facts text not null default '',
  stripe_customer text unique, subscription_status text
);
create table public.sessions (
  id uuid primary key default gen_random_uuid(), user_id text not null references public.accounts(user_id) on delete cascade,
  status text not null check(status in ('active','paused','ended')),
  charged_at timestamptz not null default now(), lease_until timestamptz not null default now() + interval '15 seconds',
  elapsed_seconds bigint not null default 0
);
create unique index one_active_session on public.sessions(user_id) where status='active';
create table public.credit_grants (invoice_id text primary key, user_id text not null references public.accounts(user_id) on delete cascade, seconds bigint not null check(seconds>0), created_at timestamptz not null default now());
-- Desktop credentials are opaque random values; only their SHA-256 hashes are stored.
create table public.desktop_tokens (
  id uuid primary key default gen_random_uuid(), user_id text not null references public.accounts(user_id) on delete cascade, email text,
  access_hash text not null unique, refresh_hash text not null unique,
  access_expires timestamptz not null default now() + interval '10 minutes', refresh_expires timestamptz not null default now() + interval '30 days'
);
-- RLS with no policies: only the API's owner connection reads or writes application data.
alter table public.accounts enable row level security;
alter table public.sessions enable row level security;
alter table public.credit_grants enable row level security;
alter table public.desktop_tokens enable row level security;
revoke all on table public.accounts,public.sessions,public.credit_grants,public.desktop_tokens from public;
create function public.session_action(p_user text,p_id uuid default null,p_action text default 'get',p_trial bigint default 600)
returns jsonb language plpgsql set search_path=public as $$
declare a accounts; s sessions; active sessions; charge bigint; stamp timestamptz:=clock_timestamp();
begin
  if p_trial<0 or p_trial>36000 then raise exception 'Invalid trial'; end if;
  insert into accounts(user_id,balance_seconds) values(p_user,p_trial) on conflict do nothing;
  select * into a from accounts where user_id=p_user for update;
  -- Reconcile every active lease before any account/session operation, under the same account lock.
  select * into active from sessions where user_id=p_user and status='active' for update;
  if found then
    charge:=least(a.balance_seconds,greatest(0,floor(extract(epoch from least(stamp,active.lease_until)-active.charged_at))::bigint));
    update accounts set balance_seconds=balance_seconds-charge where user_id=p_user returning * into a;
    update sessions set elapsed_seconds=elapsed_seconds+charge, charged_at=charged_at+charge*interval '1 second',
      status=case when lease_until<=stamp or a.balance_seconds=0 then 'paused' else status end where id=active.id;
  end if;
  if p_action='account' then return jsonb_build_object('balanceSeconds',a.balance_seconds,'plan',a.plan); end if;
  if p_action='start' then
    select * into s from sessions where user_id=p_user and status='active';
    if not found then
      if a.balance_seconds=0 then raise exception 'Credits exhausted'; end if;
      insert into sessions(user_id,status,charged_at,lease_until) values(p_user,'active',stamp,stamp+interval '15 seconds') returning * into s;
    end if;
  else
    select * into s from sessions where id=p_id and user_id=p_user for update;
    if not found then raise exception 'Session not found'; end if;
    if p_action='heartbeat' and s.status='active' then update sessions set lease_until=stamp+interval '15 seconds' where id=s.id returning * into s;
    elsif p_action='pause' and s.status='active' then update sessions set status='paused',lease_until=stamp where id=s.id returning * into s;
    elsif p_action='end' then update sessions set status='ended' where id=s.id returning * into s;
    elsif p_action='resume' and s.status='paused' then
      if a.balance_seconds=0 then raise exception 'Credits exhausted'; end if;
      if exists(select 1 from sessions where user_id=p_user and status='active') then raise exception 'Another session is active'; end if;
      update sessions set status='active',charged_at=stamp-greatest(interval '0 seconds',s.lease_until-s.charged_at),lease_until=stamp+interval '15 seconds' where id=s.id returning * into s;
    elsif p_action not in ('get','heartbeat','pause','resume') then raise exception 'Invalid action'; end if;
  end if;
  return jsonb_build_object('id',s.id,'status',s.status,'remainingSeconds',a.balance_seconds,'elapsedSeconds',s.elapsed_seconds);
end $$;
create function public.grant_invoice(p_invoice text,p_user text,p_seconds bigint)
returns boolean language plpgsql set search_path=public as $$
begin
  if p_seconds<=0 or p_seconds>31536000 then raise exception 'Invalid allowance'; end if;
  perform 1 from accounts where user_id=p_user for update;
  if not found then raise exception 'Account not found'; end if;
  insert into credit_grants(invoice_id,user_id,seconds) values(p_invoice,p_user,p_seconds) on conflict do nothing;
  if not found then return false; end if;
  update accounts set balance_seconds=balance_seconds+p_seconds where user_id=p_user;
  return true;
end $$;
create function public.desktop_token_issue(p_user text,p_email text,p_access text,p_refresh text)
returns void language plpgsql set search_path=public as $$
begin
  delete from desktop_tokens where refresh_expires<=now();
  insert into desktop_tokens(user_id,email,access_hash,refresh_hash) values(p_user,p_email,p_access,p_refresh);
end $$;
create function public.desktop_token_rotate(p_refresh text,p_access text,p_next text)
returns boolean language plpgsql set search_path=public as $$
begin
  -- One UPDATE: a concurrent caller waits on the row, then no longer matches the replaced hash.
  update desktop_tokens set access_hash=p_access,refresh_hash=p_next,access_expires=now()+interval '10 minutes',refresh_expires=now()+interval '30 days'
    where refresh_hash=p_refresh and refresh_expires>now();
  return found;
end $$;
revoke all on function public.session_action(text,uuid,text,bigint) from public;
revoke all on function public.grant_invoice(text,text,bigint) from public;
revoke all on function public.desktop_token_issue(text,text,text,text) from public;
revoke all on function public.desktop_token_rotate(text,text,text) from public;
