-- Revert the auth Edge to its previous version before removing its DB contract.
drop function public.kinojo_auth_login_admit_v546(text);
drop table private.auth_login_buckets_v546;
