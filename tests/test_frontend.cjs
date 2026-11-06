const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = new Map();
const document = {
  addEventListener() {},
  querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, {querySelectorAll(){return [];},innerHTML:'',textContent:'',className:'',close(){},showModal(){},focus(){}});
    return elements.get(selector);
  },
};
const styleSource = fs.readFileSync('static/style.css','utf8');
const context = vm.createContext({document,window:{addEventListener(){}},confirmResult:true,console,Intl,Date,Number,String,Array,Object,Error,JSON,Promise,Math,RegExp,Map,setTimeout,clearTimeout,assert,styleSource});
context.confirm=()=>context.confirmResult;
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
data.payments.forEach(p=>p.student_id=1);
data.billing={charges:[{...data.lessons[0],currency:'CHF',kind:'lesson',total:6000,paid:6000,credit_applied:4000,due:0,date:data.lessons[0].start},{...data.lessons[1],currency:'CHF',kind:'lesson',total:5000,paid:5000,credit_applied:5000,due:0,date:data.lessons[1].start}],accounts:[{student_id:1,currency:'CHF',billed:11000,received:17000,balance:-6000,credit:6000,due:0}]};
data.notes=[{id:1,student_id:1,lesson_id:1,title:'Algebra notes',body:'# A goal',updated:localDate()+'T10:00'}];
const originalStudents=[...data.students],originalLessons=[...data.lessons],originalNotes=[...data.notes];
data.students.push({id:2,name:'Grace',subject:'Physics',email:'',phone:'',rate:7000,color:'blue',details:'',archived:1});
data.lessons.push(
 {id:10,student_id:1,title:'Older topic',start:'2026-11-01T10:00',minutes:60,status:'completed'},
 {id:11,student_id:2,title:'Newer topic',start:'2026-11-06T09:00',minutes:60,status:'completed'}
);
data.notes=[
 {id:10,student_id:1,lesson_id:10,title:'Older topic',body:'Older body',updated:'2030-01-01T10:00'},
 {id:11,student_id:2,lesson_id:11,title:'Newer topic',body:'Newer body',updated:'2000-01-01T10:00'},
 {id:12,student_id:null,lesson_id:null,title:'General planning',body:'General body',updated:'2026-11-04T10:00'},
 {id:13,student_id:1,lesson_id:999,title:'Missing lesson topic',body:'Fallback body',updated:'2026-11-05T10:00'}
];
assert.equal(noteLesson(data.notes[0]).id,10);
assert.equal(noteDisplayTitle(data.notes[0]),'Ada <script> · '+dateLabel('2026-11-01T10:00'));
assert.equal(noteDisplayTitle(data.notes[1]),'Grace · '+dateLabel('2026-11-06T09:00'));
assert.equal(noteDisplayTitle(data.notes[2]),'General planning');
assert.equal(noteDisplayTitle(data.notes[3]),'Missing lesson topic');
assert.equal(noteDate(data.notes[3]),'2026-11-05T10:00');
noteStudentFilter='all';search='';
assert.deepEqual(visibleNotes().map(n=>n.id),[11,13,12,10]);
let notebookHtml=notes();
assert.ok(notebookHtml.includes('Grace · '+dateLabel('2026-11-06T09:00')));
assert.ok(notebookHtml.includes('Newer topic'));
assert.ok(notebookHtml.includes('General notes'));
assert.ok(notebookHtml.includes('Grace'));
noteStudentFilter='1';search='older';
assert.deepEqual(visibleNotes().map(n=>n.id),[10]);
noteStudentFilter='general';search='planning';
assert.deepEqual(visibleNotes().map(n=>n.id),[12]);
noteStudentFilter='2';search='';selectedNote=11;noteDraft=data.notes[1];
assert.ok(editor().includes('Grace · '+dateLabel('2026-11-06T09:00')));
assert.ok(editor().includes('Topic (optional)'));
noteStudentFilter='all';search='';selectedNote=null;noteDraft=null;
data.students=originalStudents;data.lessons=originalLessons;data.notes=originalNotes;
assert.equal(charges().length,2);
assert.equal(balance(1),-6000);
assert.equal(balanceLabel(1),'Credit available');
assert.ok(balanceDisplay(1).includes('60.00'));
assert.ok(packs().includes('Payment received'));
assert.ok(!packs().includes('Schedule from pack'));
assert.equal(charges().filter(c=>c.due>0).length,0);
for(const key of ['overview','calendar','students','accounts','packs','notes','settings']){
 route=key;render();const html=document.querySelector('#app').innerHTML;
 assert.ok(!html.includes('undefined'),key+' should have complete values');
 assert.ok(!html.includes('Ada <script>'),key+' should escape user text');
}
data.lessons.push({id:4,student_id:1,title:'Cancelled lesson',start:localDate()+'T16:00',minutes:60,rate:6000,amount:6000,status:'cancelled',pack_id:null,location:''});
data.billing.charges.push({id:99,student_id:1,title:'Outstanding lesson',kind:'lesson',total:6000,paid:3000,due:3000,date:localDate(),currency:'CHF'});
route='overview';render();
let overviewHtml=document.querySelector('#app').innerHTML;
assert.ok(overviewHtml.includes('overview-week-preview'));
assert.equal((overviewHtml.match(/data-overview-day="/g)||[]).length,7);
assert.ok(overviewHtml.includes('Payments to follow up'));
assert.ok(overviewHtml.includes('Record payment'));
assert.ok(!overviewHtml.includes('Cancelled lesson'));
assert.ok(styleSource.includes('@media(max-width:1100px)'));
assert.deepEqual([...overviewHtml.matchAll(/<button class="stat"[^>]*data-nav="([^"]+)"/g)].map(match=>match[1]),['calendar','students','accounts','accounts']);
route='accounts';render();
assert.equal(document.querySelector('#app').innerHTML.includes('<button class="stat"'),false);
selectedStudent=1;route='students';render();
assert.equal(document.querySelector('#app').innerHTML.includes('<button class="stat"'),false);
selectedStudent=null;
route='accounts';accountTab='payments';render();assert.ok(document.querySelector('#app').innerHTML.includes('Transfer'));
selectedStudent=1;route='students';render();
let studentProfileHtml=document.querySelector('#app').innerHTML;
assert.ok(studentProfileHtml.includes('Lesson history'));
assert.ok(studentProfileHtml.includes('View all notes'));
assert.ok(studentProfileHtml.includes('Ada &lt;script&gt; ·'));
assert.ok(studentProfileHtml.includes('data-action="open-note" data-id="1"'));
dirty=true;noteStudentFilter='all';confirmResult=false;
openStudentNotes(1);
assert.equal(route,'students');
assert.equal(noteStudentFilter,'all');
assert.equal(dirty,true);
confirmResult=true;openStudentNotes(1);
assert.equal(route,'notes');
assert.equal(noteStudentFilter,'1');
assert.equal(selectedStudent,null);
assert.equal(selectedNote,null);
assert.equal(dirty,false);
data.students.push({id:2,name:'Grace',subject:'Physics',rate:7000,color:'blue',archived:0});
data.notes.push({id:2,student_id:2,lesson_id:null,title:'Physics planning',body:'',updated:localDate()+'T11:00'});
noteStudentFilter='1';openNote(2);
assert.equal(noteStudentFilter,'2');
assert.deepEqual(visibleNotes().map(n=>n.id),[2]);
data.students.pop();data.notes.pop();noteStudentFilter='all';selectedNote=null;
calendarMode='month';route='calendar';render();assert.ok(document.querySelector('#app').innerHTML.includes('month-grid'));
noteDraft=data.notes[0];selectedNote=1;assert.ok(editor().includes('Save note'));
assert.ok(button('Complete','lesson-status').includes('type="button"'));
assert.ok(markdown('# Heading').includes('<h1>Heading</h1>'));
assert.ok(markdown('[[Algebra notes]]').includes('data-id="1"'));
assert.ok(markdown('[['+noteDisplayTitle(data.notes[0])+']]').includes('data-id="1"'));
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
data.billing.accounts=[{student_id:1,currency:'USD',balance:4000,due:4000,credit:0},{student_id:1,currency:'GBP',balance:-15000,due:0,credit:15000}];
data.billing.charges[0].currency='USD';data.billing.charges[1].currency='GBP';
assert.equal(balance(1),3455-17813);
assert.equal(convert(-11000,'USD'),-9500);
assert.ok(balanceDisplay(1).includes('credit'));
assert.ok(originalBalances(1).includes('due'));
assert.ok(originalBalances(1).includes('credit'));
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
console.log('Frontend checks passed: empty and populated screens, billing totals, student credit, note formatting, safe links, and form actions.');
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
 const originalDialog=showDialog,originalSubmit=submitForm,originalScope=chooseLessonScope;
 let submitted;
 showDialog=()=>{};
 chooseLessonScope=()=>{throw Error('No future lessons exist, so this popup should not block scheduling.');};
 const form=document.querySelector('#modal-form');
 const submit={disabled:false,textContent:''};
 form.querySelector=()=>submit;form.addEventListener=()=>{};form.dataset={};
 document.querySelector('#rate-field label').firstChild={textContent:''};
 submitForm=async(event,action,message,transform)=>{
  submitted=transform(Object.fromEntries(Object.entries(form.elements).filter(([,input])=>!input.disabled).map(([key,input])=>[key,input.value])));
 };
 data.packs=[];data.settings.time_format='24';
 for(const series of [null,'series-with-no-future-lessons']){
  data.lessons=[{id:10,student_id:1,title:'Existing lesson',series_id:series,start:'2026-10-06T15:45',minutes:60,rate:6000,currency:'CHF',status:'scheduled'}];
  form.elements=Object.fromEntries(Object.entries({id:'10',student_id:'1',title:'Existing lesson',lesson_date:'2026-10-06',lesson_hour:'15',lesson_minute:'45',minutes:'60',rate:'60',pack_id:'',location:'Online',repeat:'none',repeat_count:'4'}).map(([key,value])=>[key,{value,addEventListener(){}}]));
  lessonForm({id:10});
  form.elements.repeat.value='weekly';form.elements.repeat.onchange();
  form.elements.repeat_count.value='6';form.elements.repeat_count.oninput();
  assert.equal(form.elements.repeat_count.disabled,false);
  assert.ok(submit.textContent.includes('schedule weekly'));
  await form.onsubmit({preventDefault(){}});
  assert.equal(submitted.id,'10');
  assert.equal(submitted.repeat,'weekly');
  assert.equal(submitted.repeat_count,'6');
  assert.equal(submitted.start,'2026-10-06T15:45');
  assert.equal(submitted.edit_scope,'single');
 }
 showDialog=originalDialog;submitForm=originalSubmit;chooseLessonScope=originalScope;
 console.log('Existing lesson form checks passed: switching to weekly submits the selected date, time, and six weeks without a blocking scope popup.');

})()`,context)).catch(error=>{console.error(error);process.exitCode=1;});
