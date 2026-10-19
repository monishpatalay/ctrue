-- Run with ON_ERROR_STOP in a disposable database after migration; assertions roll back.
begin;
do $$
declare uid text:='user-one'; other_uid text:='user-two'; s jsonb; sid uuid; refused boolean:=false;
begin
  s:=public.session_action(uid,null,'start',100); sid:=(s->>'id')::uuid;
  assert (public.session_action(uid,null,'start',100)->>'id')::uuid=sid,'Duplicate start created another session';
  update sessions set charged_at=clock_timestamp()-interval '60 seconds',lease_until=clock_timestamp()-interval '45 seconds' where id=sid;
  s:=public.session_action(uid,sid,'get',100);
  assert s->>'status'='paused','Expired lease stayed active';
  assert (s->>'remainingSeconds')::bigint=85,'Disconnected charge exceeded 15 seconds';
  assert (public.session_action(uid,sid,'pause',100)->>'remainingSeconds')::bigint=85,'Duplicate pause charged again';
  perform public.session_action(uid,sid,'resume',100);
  perform public.session_action(uid,sid,'pause',100);
  perform public.session_action(uid,null,'start',100);
  begin perform public.session_action(uid,sid,'resume',100);exception when others then refused:=true;end;
  assert refused,'Allowed two active sessions';
  refused:=false;
  begin perform public.session_action(other_uid,sid,'get',100);exception when others then refused:=true;end;
  assert refused,'Cross-user session accepted';
  perform public.session_action(uid,sid,'end',100);
  assert public.session_action(uid,sid,'resume',100)->>'status'='ended','Resumed ended session';
  -- Desktop credentials: rotation replaces both hashes once; reuse, expiry and revocation are refused.
  perform public.desktop_token_issue(uid,'one@example.com','access-1','refresh-1');
  assert (select user_id from desktop_tokens where access_hash='access-1' and access_expires>now())=uid,'Issued access token not usable';
  assert public.desktop_token_rotate('refresh-1','access-2','refresh-2'),'Valid refresh token refused';
  assert not public.desktop_token_rotate('refresh-1','access-3','refresh-3'),'Rotated refresh token reused';
  assert not exists(select 1 from desktop_tokens where access_hash in ('access-1','access-3')),'Stale access token survived rotation';
  update desktop_tokens set access_expires=now()-interval '1 second' where access_hash='access-2';
  assert not exists(select 1 from desktop_tokens where access_hash='access-2' and access_expires>now()),'Expired access token usable';
  update desktop_tokens set refresh_expires=now()-interval '1 second' where refresh_hash='refresh-2';
  assert not public.desktop_token_rotate('refresh-2','access-4','refresh-4'),'Expired refresh token rotated';
  perform public.desktop_token_issue(uid,null,'access-5','refresh-5');
  assert (select count(*) from desktop_tokens where user_id=uid)=1,'Expired credential not cleaned up';
  delete from desktop_tokens where refresh_hash='refresh-5';
  assert not public.desktop_token_rotate('refresh-5','access-6','refresh-6'),'Revoked refresh token rotated';
  -- Free mode: time is tracked but never spent, and an empty balance does not block.
  update accounts set balance_seconds=0 where user_id=uid;
  s:=public.session_action(uid,null,'start',100,false); sid:=(s->>'id')::uuid;
  update sessions set charged_at=clock_timestamp()-interval '10 seconds',lease_until=clock_timestamp()+interval '10 seconds' where id=sid;
  s:=public.session_action(uid,sid,'get',100,false);
  assert s->>'status'='active' and (s->>'remainingSeconds')::bigint=0,'Free session paused or charged';
  assert (s->>'elapsedSeconds')::bigint>=10,'Free session did not track time';
  assert public.session_action(uid,sid,'pause',100,false)->>'status'='paused','Free session did not pause';
  assert public.session_action(uid,sid,'resume',100,false)->>'status'='active','Free session could not resume with an empty balance';
  refused:=false;
  begin perform public.session_action(uid,sid,'pause',100,true); perform public.session_action(uid,sid,'resume',100,true); exception when others then refused:=true; end;
  assert refused,'Metered resume allowed with an empty balance';
  refused:=false;
  begin perform public.desktop_token_issue('no-account',null,'access-7','refresh-7');exception when others then refused:=true;end;
  assert refused,'Credential issued without an account';
  assert not exists(select 1 from information_schema.columns where table_schema='public' and table_name='accounts' and column_name in ('stripe_customer','subscription_status')),'Payment columns still present';
  assert to_regclass('public.credit_grants') is null and to_regprocedure('public.grant_invoice(text,text,bigint)') is null,'Payment table or function still present';
end $$;
rollback;
