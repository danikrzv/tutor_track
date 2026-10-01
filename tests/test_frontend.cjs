const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = new Map();
const document = {
  addEventListener() {},
  querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, {innerHTML:'',textContent:'',className:'',close(){},focus(){}});
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
console.log('Frontend checks passed: empty and populated screens, billing totals, pack usage, note formatting, safe links, and form actions.');
`,context);
