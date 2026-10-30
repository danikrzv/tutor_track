const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');
const document={addEventListener(){},querySelector(){return null;}};
const context=vm.createContext({document,window:{addEventListener(){}},console,Intl,Date,Number,String,Array,Object,Error,JSON,Promise,Math,RegExp,Map,setTimeout,clearTimeout,assert});
vm.runInContext(fs.readFileSync('static/app.js','utf8').split('refresh().then(render)')[0],context);
vm.runInContext(`
assert.equal(localDate(calendarPeriod(new Date(2026,0,31),'month',1)),'2026-02-01');
assert.equal(localDate(calendarPeriod(new Date(2026,0,1),'week',-1)),'2025-12-22');
assert.equal(localDate(calendarPeriod(new Date(2026,9,25),'week',1)),'2026-10-26');
assert.equal(localDate(calendarPeriod(new Date(2024,1,29),'month',1)),'2024-03-01');
for(const mode of ['week','month']){
 const periods=calendarPeriods(new Date(2026,9,29),mode);
 assert.equal(periods.length,7);
 assert.equal(new Set(periods.map(localDate)).size,7);
 for(let i=1;i<periods.length;i++)assert.equal(localDate(periods[i]),localDate(calendarPeriod(periods[i-1],mode,1)));
}
assert.ok(calendarPeriods(new Date(2000,0,1),'month').every(d=>d.getFullYear()>=2000));
assert.ok(calendarPeriods(new Date(2100,11,31),'month').every(d=>d.getFullYear()<=2100));
console.log('Calendar date checks passed');
`,context);
vm.runInContext(`
data={students:[],lessons:[],packs:[],payments:[],notes:[],settings:{currency:'CHF'},billing:{charges:[],accounts:[]}};
for(const mode of ['week','month']){
 calendarMode=mode;calendarDate=new Date(2026,9,29);calendarScrollOffset=37;
 const nodes=[];
 const pane={scrollTop:0,clientHeight:500,querySelectorAll:()=>nodes,
  get children(){return nodes;},get firstElementChild(){return nodes[0];},get lastElementChild(){return nodes.at(-1);},
  get scrollHeight(){return nodes.reduce((n,e)=>n+e.offsetHeight,0);},
  insertAdjacentHTML(where,html){const key=html.match(/data-date="([^"]+)"/)[1],node=makeNode(key);where==='afterbegin'?nodes.unshift(node):nodes.push(node);}
 };
 function makeNode(key){return {dataset:{date:key},offsetHeight:400+Number(key.slice(-2))*5,
  get offsetTop(){return nodes.slice(0,nodes.indexOf(this)).reduce((n,e)=>n+e.offsetHeight,0);},
  remove(){nodes.splice(nodes.indexOf(this),1);}};}
 nodes.push(...calendarPeriods(calendarDate).map(d=>makeNode(localDate(d))));
 const title={textContent:''};document.querySelector=selector=>selector==='#calendar-scroll'?pane:title;
 bindCalendarScroll();
 assert.equal(pane.scrollTop,nodes[3].offsetTop+37);
 const original=nodes[3].dataset.date;
 for(const direction of ['down','up'])for(let i=0;i<40;i++){
  pane.scrollTop=direction==='down'?pane.scrollHeight-pane.clientHeight-20:20;
  const anchor=nodes.find(e=>e.offsetTop+e.offsetHeight>pane.scrollTop+1),offset=pane.scrollTop-anchor.offsetTop;
  pane.onscroll();
  assert.ok(nodes.length<=12,'rendered periods stay bounded');
  assert.equal(pane.scrollTop-anchor.offsetTop,offset,'visible content stays in place');
  assert.equal(localDate(calendarDate),anchor.dataset.date);
  for(let j=1;j<nodes.length;j++)assert.equal(nodes[j].dataset.date,localDate(calendarPeriod(new Date(nodes[j-1].dataset.date+'T12:00:00'),mode,1)));
 }
 assert.notEqual(nodes[3].dataset.date,original);
}
console.log('Calendar scrolling checks passed: both directions, bounded content, contiguous dates, and stable viewport');
`,context);
