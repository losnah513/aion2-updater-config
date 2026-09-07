-- Read-only assertions, no character data writes.
do $test$
declare r jsonb;
begin
  r:=private.kinojo_normalize_equipped_titles_v466('{"titleList":[{"id":1,"name":"fixture","grade":"Unique","equipCategory":"Attack","statList":[{"desc":"OWNED_ONLY"}],"equipStatList":[{"desc":"APPLIED_ONLY"}]}]}'::jsonb);
  assert r#>>'{0,status}'='equipped';
  assert r#>'{0,effects}'='["APPLIED_ONLY"]'::jsonb;
  assert r#>>'{1,status}'='unequipped';
  assert private.kinojo_normalize_equipped_titles_v466(null)#>>'{0,status}'='unavailable';
  assert private.kinojo_normalize_equipped_titles_v466('{"titleList":{}}')#>>'{0,status}'='unavailable';
  assert private.kinojo_normalize_equipped_titles_v466('{"titleList":[]}')#>>'{0,status}'='unequipped';
  assert private.kinojo_normalize_equipped_titles_v466('{"titleList":[{"equipCategory":"Attack"},{"equipCategory":"Attack"}]}')#>>'{0,status}'='unavailable';
  assert public.kinojo_character_equipped_titles_v466(0,'')->>'code'='CHARACTER_IDENTITY_REQUIRED';
  assert has_function_privilege('anon','public.kinojo_character_equipped_titles_v466(integer,text)','EXECUTE');
  assert not has_function_privilege('anon','private.kinojo_normalize_equipped_titles_v466(jsonb)','EXECUTE');
end;
$test$;
