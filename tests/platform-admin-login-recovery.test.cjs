const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let admin=false,reloads=0,login=0;const events={};
const A={state:{},$:()=>({addEventListener(){}}),$$:()=>[],isAdmin:()=>admin};
const window={KinojoAdmin:A,KinojoAuth:{openLoginModal:()=>login++},addEventListener:(n,fn)=>events[n]=fn};
const context={window,document:{readyState:'loading',body:{innerHTML:''},addEventListener(){}},location:{reload:()=>reloads++},setTimeout,clearTimeout,console};
vm.runInNewContext(fs.readFileSync('admin/js/admin-bootstrap.js','utf8'),context);
A.renderAccessBlocked();events['kinojo:auth-changed']();assert.equal(reloads,0);admin=true;events['kinojo:auth-changed']();events['kinojo:auth-changed']();assert.equal(reloads,1);assert.ok(context.document.body.innerHTML.includes('box-sizing:border-box'));
console.log('PASS: blocked gate restores normal document exactly once after authorized login; non-admin event does not reload');
