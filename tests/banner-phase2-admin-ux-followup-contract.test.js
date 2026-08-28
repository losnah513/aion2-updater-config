'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
const tabs=read('admin/js/admin-banner-tabs.js');
const bootstrap=read('admin/js/admin-bootstrap.js');
const events=read('admin/js/admin-banner-events.js');
const library=read('admin/js/admin-banner-library.js');
const workflow=read('admin/js/admin-banner-event-workflow.js');
const pool=read('admin/js/admin-banner-auto-pool.js');
const shared=read('admin/js/admin-shared.js');
const css=read('admin/css/admin.css');

const create=tabs.indexOf('data-banner-view="create"');
const management=tabs.indexOf('data-banner-view="events"');
const libraryTab=tabs.indexOf('data-banner-view="library"');
assert.ok(create>=0&&create<management&&management<libraryTab,'secondary navigation must be ordered: create, events, library');
for(const token of [
  '새 이벤트','이벤트 관리','이미지 라이브러리',
  "return parts[0]==='images'&&parts[1]===kind&&['create','events','library'].includes(parts[2])?parts[2]:'create'",
  'writeViewRoute(kind,view)',"view=['create','events','library'].includes(view)?view:'create'",
  "const order=['create','events','library']",
])assert.ok(tabs.includes(token),`missing three-page navigation contract: ${token}`);
assert.equal(events.includes('data-bem-create'),false,'event management must not contain the old create launcher');
for(const token of [
  'let [tab,subtab,view]',"view:['create','events','library'].includes(view)?view:''",
  "if(tab==='images'&&(subtab==='main'||subtab==='side'))",
  "IMAGE_VIEW_LABELS={create:'새 이벤트',events:'이벤트 관리',library:'이미지 라이브러리'}",
])assert.ok(bootstrap.includes(token),`missing routed image workspace contract: ${token}`);

for(const token of [
  'characterComposing:false','data-bal-character-results','refreshCharacterSearchState()',
  "if(S.characterComposing)return","event.isComposing||S.characterComposing",
  '.bal-character-choice:hover','.bal-character-choice:active','.bal-character-choice.is-linking',
])assert.ok(library.includes(token),`missing IME-safe library character search contract: ${token}`);
const librarySearch=library.slice(library.indexOf('async function searchCharacter()'),library.indexOf('function scheduleCharacterSearch()'));
assert.equal(librarySearch.includes('renderDetail'),false,'library character lookup must not replace its active input');
const titleCheck=library.slice(library.indexOf('async function checkTitle()'),library.indexOf('function scheduleTitleCheck()'));
assert.equal(titleCheck.includes('renderDetail'),false,'library title check must preserve the active title input');

for(const token of [
  'characterComposing:false','characterNonce:0','data-bew-character-results',
  'refreshFileCharacterSearch(s,index)','item.characterComposing','emojiComposing:false',
  "editor?.classList.remove('invalid')",'.bew-character-choice:hover','.bew-character-choice:active',
])assert.ok(workflow.includes(token),`missing IME-safe authoring input contract: ${token}`);
const fileSearch=workflow.slice(workflow.indexOf('async function searchFileCharacter'),workflow.indexOf('function renderFiles'));
assert.equal(fileSearch.includes('renderFiles'),false,'authoring character lookup must only refresh the result region');
for(const token of ['queryComposing:false','if(!S.queryComposing)renderQuery()','data-bap-query'])assert.ok(pool.includes(token),`missing IME-safe random-event search contract: ${token}`);

for(const token of ['function showAdminActionToast(',"kind==='pending'",'duration=Number(options.duration)','aria-live'])assert.ok(shared.includes(token),`missing centered action toast behavior: ${token}`);
for(const token of ['.admin-action-toast-layer','.admin-action-toast.is-visible','.admin-action-toast.is-leaving','.admin-statusline.is-action-mirrored','prefers-reduced-motion'])assert.ok(css.includes(token),`missing centered action toast presentation: ${token}`);
for(const source of [events,library,workflow,pool])assert.ok(source.includes('showAdminActionToast?.'),'banner action module must mirror server feedback to the centered toast');

console.log('PASS banner phase-2 admin UX follow-up contract');
