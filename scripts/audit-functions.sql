select p.proname, pg_get_function_identity_arguments(p.oid) as arguments, p.prosecdef, p.proconfig, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('touch_updated_date','classify_exclusion_reason','unregistered_pfc_values','log_unregistered_pfc','stamp_net_worth_value_change','is_exchange_transfer','crypto_asset_summary','crypto_pnl_by_year','crypto_time_coverage','crypto_yearly_summary','delete_all_my_data');
