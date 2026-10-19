-- Ctrue is free and open source with no payments: remove the dormant Stripe billing objects. Apply after 002.
drop function if exists public.grant_invoice(text,text,bigint);
drop table if exists public.credit_grants;
alter table public.accounts drop column if exists stripe_customer, drop column if exists subscription_status;
