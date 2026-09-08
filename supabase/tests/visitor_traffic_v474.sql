-- Run inside BEGIN/ROLLBACK. Does not retain fixtures or change user events.
do $test$
declare a bigint; n integer; d date:='2099-01-01';
begin
 select id into strict a from public.member_codes where is_automation_account;
 assert public.kinojo_visit_traffic_class_v474(null,'https://kinojo.info/','Chrome')='PUBLIC';
 assert public.kinojo_visit_traffic_class_v474(null,'http://127.0.0.1:5555/','Chrome')='LOCAL_TEST';
 assert public.kinojo_visit_traffic_class_v474(null,'http://localhost:5555/','Chrome')='LOCAL_TEST';
 assert public.kinojo_visit_traffic_class_v474(null,'http://[::1]:5555/','Chrome')='LOCAL_TEST';
 assert public.kinojo_visit_traffic_class_v474(null,'https://localhost.example.com/','Chrome')='PUBLIC';
 assert public.kinojo_visit_traffic_class_v474(null,'https://kinojo.info/','HeadlessChrome/152')='AUTOMATED';
 assert public.kinojo_visit_traffic_class_v474(a,'https://kinojo.info/','Chrome')='INTERNAL_ADMIN';
 insert into public.kinojo_page_view_events(event_id,page_key,page_url,visitor_key,user_agent,event_type,visit_date_kst,traffic_class)
 values('v474-public','home','https://kinojo.info/','v474-normal','Chrome','PAGE_VIEW',d,'INTERNAL_ADMIN'),
 ('v474-local','home','http://127.0.0.1:123/','v474-local','Chrome','PAGE_VIEW',d,'PUBLIC'),
 ('v474-bot','home','https://kinojo.info/','v474-bot','HeadlessChrome/152','PAGE_VIEW',d,'PUBLIC'),
 ('v474-before-login','home','https://kinojo.info/','v474-admin','Chrome','PAGE_VIEW',d,'PUBLIC');
 assert (select traffic_class='PUBLIC' from public.kinojo_page_view_events where event_id='v474-public'),'client classification must not be trusted';
 perform public.kinojo_refresh_visit_daily_266(d);
 assert (select unique_visitors=2 and page_views=2 from public.kinojo_visit_daily_266 where visit_date=d);
 insert into public.kinojo_page_view_events(event_id,page_key,page_url,visitor_key,user_agent,event_type,member_id,visit_date_kst)
 values('v474-login','admin','https://kinojo.info/admin/','v474-admin','Chrome','LOGIN',a,d);
 insert into public.kinojo_page_view_events(event_id,page_key,page_url,visitor_key,user_agent,event_type,visit_date_kst)
 values('v474-after-logout','home','https://kinojo.info/','v474-admin','Chrome','PAGE_VIEW',d);
 perform public.kinojo_refresh_visit_daily_266(d);
 assert (select count(*)=3 from public.kinojo_page_view_events where visit_date_kst=d and traffic_class='INTERNAL_ADMIN');
 assert (select unique_visitors=1 and anonymous_visitors=1 and page_views=1 from public.kinojo_visit_daily_266 where visit_date=d);
 assert (select sum(page_views)=1 from public.kinojo_visit_page_daily_266 where visit_date=d);
 assert not has_function_privilege('anon','public.kinojo_visit_traffic_class_v474(bigint,text,text)','execute');
 assert not has_function_privilege('authenticated','public.kinojo_classify_visit_event_v474()','execute');
end $test$;
select 'PASS: classification, spoof prevention, prelogin, postlogout, daily/page aggregates, ACL' result;

