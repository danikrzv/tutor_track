const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = new Map();
const document = {
  addEventListener() {},
  querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, {innerHTML:'',textContent:'',className:'',close(){},showModal(){},focus(){}});
    return elements.get(selector);
  },
};
const context = vm.createContext({document,window:{addEventListener(){}},console,Intl,Date,Number,String,Array,Object,Error,JSON,Promise,Math,RegExp,Map,setTimeout,clearTimeout,assert});
let source = fs.readFileSync('static/app.js','utf8');
source = source.slice(0,source.indexOf('refresh().then(render)'));
vm.runInContext(source,context);
vm.runInContext(`
data={students:[],lessons:[],packs:[],payments:[],notes:[],settings:{currency:'CHF'}};
for(const key of ['overview','calendar','students','accounts','packs','notes','settings']){
 route=key;render();assert.ok(document.querySelector('#app').innerHTML.includes('TutorTrack'));
 assert.ok(!document.querySelector('#app').innerHTML.includes('undefined'));
}
data.students=[{id:1,name:'Ada <script>',subject:'Math',email:'ada@example.com',phone:'',rate:6000,color:'purple',details:'A goal',archived:0}];
data.lessons=[
 {id:1,student_id:1,title:'Algebra',start:localDate()+'T10:00',minutes:60,rate:6000,amount:6000,status:'completed',pack_id:null,location:''},
 {id:2,student_id:1,title:'Geometry',start:localDate()+'T12:00',minutes:60,rate:6000,amount:0,status:'completed',pack_id:1,location:''},
 {id:3,student_id:1,title:'Graphs',start:localDate()+'T14:00',minutes:60,rate:6000,amount:0,status:'scheduled',pack_id:1,location:'Online'},
];
data.packs=[{id:1,student_id:1,name:'3 lessons',quantity:3,minutes:60,price:15000,created:localDate()+'T09:00'}];
data.payments=[{id:1,lesson_id:1,pack_id:null,amount:2000,date:localDate(),method:'Cash'},{id:2,lesson_id:null,pack_id:1,amount:15000,date:localDate(),method:'Transfer'}];
data.notes=[{id:1,student_id:1,lesson_id:1,title:'Algebra notes',body:'# A goal',updated:localDate()+'T10:00'}];
assert.equal(charges().length,2);
assert.equal(balance(1),4000);
assert.equal(packUsage(1).done,1);
assert.equal(packUsage(1).reserved,1);
for(const key of ['overview','calendar','students','accounts','packs','notes','settings']){
 route=key;render();const html=document.querySelector('#app').innerHTML;
 assert.ok(!html.includes('undefined'),key+' should have complete values');
 assert.ok(!html.includes('Ada <script>'),key+' should escape user text');
}
route='accounts';accountTab='payments';render();assert.ok(document.querySelector('#app').innerHTML.includes('Transfer'));
selectedStudent=1;route='students';render();assert.ok(document.querySelector('#app').innerHTML.includes('Lesson history'));
calendarMode='month';route='calendar';render();assert.ok(document.querySelector('#app').innerHTML.includes('month-grid'));
noteDraft=data.notes[0];selectedNote=1;assert.ok(editor().includes('Save note'));
assert.ok(button('Complete','lesson-status').includes('type="button"'));
assert.ok(markdown('# Heading').includes('<h1>Heading</h1>'));
assert.ok(markdown('[[Algebra notes]]').includes('data-id="1"'));
assert.ok(markdown('[[Missing]]').includes('broken-link'));
assert.ok(markdown('![work](/uploads/image.png)').includes('<img'));
assert.ok(!markdown('[bad](javascript:alert(1))').includes('<a'));
assert.ok(!markdown('![bad](data:text/html,evil)').includes('<img'));
assert.ok(!markdown('<script>alert(1)</script>').includes('<script>'));
assert.ok(!markdown('![x](https://a.test/" onerror="evil)').includes('<img'));
data.settings.currency='CHF';
data.fx={rates:{EUR:'1',CHF:'0.95',USD:'1.10',GBP:'0.80',JPY:'160'},dates:{CHF:'2026-10-01',USD:'2026-10-01'},error:''};
data.students[0].currency='EUR';
data.lessons[0].currency='USD';
data.packs[0].currency='GBP';
data.payments[0].currency='USD';data.payments[1].currency='GBP';
assert.equal(convert(11000,'USD'),9500);
assert.equal(convert(100,'EUR','JPY'),16000);
assert.equal(convert(1234,'EUR','JPY'),197400);
assert.equal(convert(1234,'CHF','CHF'),1234);
assert.equal(convert(1,'EUR','USD'),1);
data.fx.rates.USD='1.005';
assert.equal(convert(100,'EUR','USD'),101);
data.fx.rates.USD='1.10';
assert.equal(balance(1),3455);
assert.equal(convertedTotal(data.payments,'amount'),19540);
assert.ok(originalBalances(1).includes('USD'));
assert.ok(chargeTable(charges()).includes('USD'));
assert.ok(chargeTable(charges()).includes('GBP'));
assert.ok(chargeTable(charges()).includes('≈'));
for(const key of ['overview','accounts','students','packs','settings']){route=key;selectedStudent=null;render();assert.ok(!document.querySelector('#app').innerHTML.includes('NaN'));}
delete data.fx.rates.USD;
assert.equal(balance(1),null);
assert.equal(convertedTotal(data.payments,'amount'),null);
assert.equal(convert(0,'USD'),0);
assert.equal(convert(1234,'USD','USD'),1234);
assert.ok(money(balance(1)).includes('unavailable'));
data.fx.error='Could not refresh';
assert.ok(fxNotice().includes('Could not refresh'));
assert.ok(chargeTable(charges()).includes('USD'));
console.log('Frontend checks passed: empty and populated screens, billing totals, pack usage, note formatting, safe links, and form actions.');
`,context);

Promise.resolve(vm.runInContext(`(async()=>{
 data.lessons=[
  {id:1,student_id:1,title:'Weekly',series_id:'one',start:'2026-10-01T10:00',status:'scheduled'},
  {id:2,student_id:1,title:'Weekly',series_id:'one',start:'2026-10-08T10:00',status:'scheduled'},
  {id:3,student_id:1,title:'Weekly',series_id:'one',start:'2026-10-15T10:00',status:'completed'},
  {id:4,student_id:1,title:'Weekly',series_id:'other',start:'2026-10-22T10:00',status:'scheduled'}
 ];
 assert.equal(followingLessons(data.lessons[0]).length,1);
 for(const [buttonId,expected] of [['scope-single','single'],['scope-following','following'],['scope-back',null]]){
  const response=chooseLessonScope(data.lessons[0]);
  assert.ok(document.querySelector('#scope-dialog').innerHTML.includes('1 later planned lesson'));
  document.querySelector('#'+buttonId).onclick();
  assert.equal(await response,expected);
 }
 const cancelled=chooseLessonScope(data.lessons[0]);
 document.querySelector('#scope-dialog').oncancel({preventDefault(){}});
 assert.equal(await cancelled,null);
 const alone=chooseLessonScope(data.lessons[3]);
 assert.ok(document.querySelector('#scope-dialog').innerHTML.includes('id="scope-following" disabled'));
 document.querySelector('#scope-back').onclick();await alone;
 console.log('Edit-scope popup checks passed: yes, no, back, Escape, and series targeting.');
})()`,context)).catch(error=>{console.error(error);process.exitCode=1;});
