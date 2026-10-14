-- Free mode: with p_metered false, sessions keep their lease and elapsed time but never spend or require credits.
-- Used while every user brings their own OpenAI key. Apply after 001.
drop function public.session_action(text,uuid,text,bigint);
create function public.session_action(p_user text,p_id uuid default null,p_action text default 'get',p_trial bigint default 600,p_metered boolean default true)
returns jsonb language plpgsql set search_path=public as $$
declare a accounts; s sessions; active sessions; charge bigint; elapsed bigint; stamp timestamptz:=clock_timestamp();
begin
  if p_trial<0 or p_trial>36000 then raise exception 'Invalid trial'; end if;
  insert into accounts(user_id,balance_seconds) values(p_user,p_trial) on conflict do nothing;
  select * into a from accounts where user_id=p_user for update;
  -- Reconcile every active lease before any account/session operation, under the same account lock.
  select * into active from sessions where user_id=p_user and status='active' for update;
  if found then
    elapsed:=greatest(0,floor(extract(epoch from least(stamp,active.lease_until)-active.charged_at))::bigint);
    charge:=case when p_metered then least(a.balance_seconds,elapsed) else 0 end;
    if p_metered then elapsed:=charge; end if;
    update accounts set balance_seconds=balance_seconds-charge where user_id=p_user returning * into a;
    update sessions set elapsed_seconds=elapsed_seconds+elapsed, charged_at=charged_at+elapsed*interval '1 second',
      status=case when lease_until<=stamp or (p_metered and a.balance_seconds=0) then 'paused' else status end where id=active.id;
  end if;
  if p_action='account' then return jsonb_build_object('balanceSeconds',a.balance_seconds,'plan',a.plan); end if;
  if p_action='start' then
    select * into s from sessions where user_id=p_user and status='active';
    if not found then
      if p_metered and a.balance_seconds=0 then raise exception 'Credits exhausted'; end if;
      insert into sessions(user_id,status,charged_at,lease_until) values(p_user,'active',stamp,stamp+interval '15 seconds') returning * into s;
    end if;
  else
    select * into s from sessions where id=p_id and user_id=p_user for update;
    if not found then raise exception 'Session not found'; end if;
    if p_action='heartbeat' and s.status='active' then update sessions set lease_until=stamp+interval '15 seconds' where id=s.id returning * into s;
    elsif p_action='pause' and s.status='active' then update sessions set status='paused',lease_until=stamp where id=s.id returning * into s;
    elsif p_action='end' then update sessions set status='ended' where id=s.id returning * into s;
    elsif p_action='resume' and s.status='paused' then
      if p_metered and a.balance_seconds=0 then raise exception 'Credits exhausted'; end if;
      if exists(select 1 from sessions where user_id=p_user and status='active') then raise exception 'Another session is active'; end if;
      update sessions set status='active',charged_at=stamp-greatest(interval '0 seconds',s.lease_until-s.charged_at),lease_until=stamp+interval '15 seconds' where id=s.id returning * into s;
    elsif p_action not in ('get','heartbeat','pause','resume') then raise exception 'Invalid action'; end if;
  end if;
  return jsonb_build_object('id',s.id,'status',s.status,'remainingSeconds',a.balance_seconds,'elapsedSeconds',s.elapsed_seconds);
end $$;
revoke all on function public.session_action(text,uuid,text,bigint,boolean) from public;
