'use strict';
const $ = (q, root=document) => root.querySelector(q);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = {
 home:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18m-13 4h2m4 0h2"/>',
 students:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/>',
 wallet:'<path d="M20 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h15V8H5a3 3 0 0 1 0-6m15 10h-5v5h5"/>',
 notes:'<path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8m-8 4h6"/>',
 pack:'<path d="m3 7 9-4 9 4v11l-9 4-9-4zM3 7l9 4 9-4M12 11v11M7 5l9 4"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
 chevron:'<path d="m9 5 7 7-7 7"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
 settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
 image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 18 6-6 4 4 3-3 5 5"/>',
 edit:'<path d="m4 16 12-12 4 4L8 20H4zM13 7l4 4"/>',
 local:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
 mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
 book:'<path d="M12 6C9 3 5 3 2 4v16c4-1 7-1 10 1 3-2 6-2 10-1V4c-3-1-7-1-10 2zm0 0v15"/>',
 back:'<path d="M19 12H5m5-5-5 5 5 5"/>'
};
const icon = (name, cls='') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.book}</svg>`;
let data, route='overview', selectedStudent=null, selectedNote=null, search='', calendarDate=new Date(), calendarMode='week', accountTab='due', showArchived=false, noteDraft=null, dirty=false;
let dialogBack = null;
let calendarScrollOffset = 0;
const navItems = [['overview','home','Overview'],['calendar','calendar','Calendar'],['students','students','Students'],['accounts','wallet','Accounts'],['packs','pack','Packs & credit'],['notes','notes','Notebook']];
const localDate = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const dateLabel = (value, opts={month:'short',day:'numeric'}) => new Date(value.length===10 ? value+'T12:00' : value).toLocaleDateString(undefined,opts);
const time = value => new Date(value).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',hourCycle:data.settings.time_format==='12'?'h12':'h23'});
const money = (cents,currency=data.settings.currency) => cents===null?'Rate unavailable':new Intl.NumberFormat(undefined,{style:'currency',currency:currency||data.settings.currency,currencyDisplay:'code'}).format((cents||0)/100);
const sum = (array,key) => array.reduce((total,item)=>total+(typeof key==='function'?key(item):item[key]),0);
const student = id => data.students.find(s=>s.id===Number(id));
const initials = name => name.split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join('').toUpperCase();
const avatar = (s,size='') => `<span class="avatar ${esc(s.color)} ${size}">${esc(initials(s.name))}</span>`;
const paid = (kind,id) => sum(data.payments.filter(p=>p[kind+'_id']===id),'amount');
const charges = () => data.billing?.charges||[];
const studentAccounts = id => (data.billing?.accounts||[]).filter(a=>a.student_id===Number(id));
const balance = id => convertedTotal(studentAccounts(id),'balance');
const accountAmount = (id,key) => convertedTotal(studentAccounts(id),key);
const balanceLabel = id => accountAmount(id,'due')>0?'Amount due':'Credit available';
const balanceDisplay = id => {
 const due=accountAmount(id,'due'),credit=accountAmount(id,'credit');
 return due===null||credit===null?'Rate unavailable':due>0?money(due)+(credit>0?' · '+money(credit)+' credit':''):money(credit);
};
const currencyOf = record => record?.currency||data.settings.currency;
function convert(amount,currency,target=data.settings.currency){
 if(currency===target||amount===0)return amount;
 if(amount<0){const value=convert(-amount,currency,target);return value===null?null:-value;}
 const from=decimalRatio(data.fx?.rates?.[currency]),to=decimalRatio(data.fx?.rates?.[target]);
 if(!from||!to)return null;
 const unit=['JPY','KRW'].includes(target)?100n:1n;
 const numerator=BigInt(amount)*to[0]*from[1],denominator=to[1]*from[0]*unit;
 return Number(((numerator*2n+denominator)/(2n*denominator))*unit);
}
function decimalRatio(value){
 if(value===undefined||!Number.isFinite(Number(value))||Number(value)<=0)return null;
 const [decimal,exponent='0']=String(value).toLowerCase().split('e');
 const parts=decimal.split('.'),scale=(parts[1]?.length||0)-Number(exponent);
 const digits=BigInt(parts.join(''));
 return scale>=0?[digits,10n**BigInt(scale)]:[digits*10n**BigInt(-scale),1n];
}
function convertedTotal(items,key){
 const groups={};
 for(const item of items){const currency=currencyOf(item);groups[currency]=(groups[currency]||0)+item[key];}
 let total=0;
 for(const [currency,amount] of Object.entries(groups)){const value=convert(amount,currency);if(value===null)return null;total+=value;}
 return total;
}
function originalBalances(id){
 return studentAccounts(id).filter(a=>a.due||a.credit).map(a=>money(a.due||a.credit,a.currency)+(a.due?' due':' credit')).join(' · ')||'Account settled';
}
function equivalent(amount,currency){
 if(currency===data.settings.currency)return '';
 const value=convert(amount,currency);
 return `<span class="cell-secondary">${value===null?'Conversion unavailable':'≈ '+money(value)}</span>`;
}
const currencyStep = currency => ['JPY','KRW'].includes(currency)?'1':'0.01';
const currencyOptions = selected => Object.entries(data.currencies||{CHF:'Swiss franc',EUR:'Euro',USD:'US dollar',GBP:'British pound',CAD:'Canadian dollar',AUD:'Australian dollar'}).map(([code,name])=>`<option value="${code}" ${code===selected?'selected':''}>${code} · ${esc(name)}</option>`).join('');
function fxNotice(){
 const dates=[...new Set(Object.values(data.fx?.dates||{}))].sort();
 const dated=dates.length?`Rates dated ${dates[0]}${dates.length>1?' – '+dates.at(-1):''}.`:'No exchange rates downloaded yet.';
 const missing=[...new Set([...data.lessons,...data.packs,...data.payments].map(currencyOf))].some(c=>c!==data.settings.currency&&convert(100,c)===null);
 return `<div class="fx-notice"><div><strong>Summary currency: ${esc(data.settings.currency)}</strong><span>${dated} Latest daily reference rates from <a href="https://frankfurter.dev/" target="_blank" rel="noopener noreferrer">Frankfurter</a>.</span>${data.fx?.checked_at?`<span>Last checked: ${dateLabel(data.fx.checked_at)} ${time(data.fx.checked_at)}</span>`:''}<span>Converted totals are estimates at these rates, including past payments. Original charges stay in their own currency.</span>${data.fx?.error?`<span class="amount-due">${esc(data.fx.error)}</span>`:''}${missing?'<span class="amount-due">Some rates are missing. Affected totals are unavailable; original amounts are still shown.</span>':''}</div>${button('Refresh rates','refresh-rates','','small')}</div>`;
}
let ratesLoading=false;
async function updateRates(force=false){
 if(ratesLoading)return;
 ratesLoading=true;
 try{const result=await api('refresh-rates',{force});data.fx=result;if(['overview','accounts','students','packs','settings'].includes(route))render();if(force)toast(result.error||'Exchange rates refreshed',!!result.error);}
 catch(e){if(force)toast(e.message,true);}
 finally{ratesLoading=false;}
}

const button = (label, action, attrs='', type='secondary') => `<button type="button" class="btn ${type}" data-action="${action}" ${attrs}>${label}</button>`;
const empty = (symbol,title,text,action='') => `<div class="empty">${icon(symbol)}<h3>${title}</h3><p>${text}</p>${action}</div>`;
function toast(message,error=false){const t=$('#toast');t.textContent=message;t.className='visible'+(error?' error':'');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.className='',4500);}
async function api(action,payload){const r=await fetch('/api/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const response=await r.json();if(!r.ok)throw Error(response.error||'Could not save.');return response;}
async function refresh(){const response=await fetch('/api/state');if(!response.ok)throw Error('Could not open the local database.');data=await response.json();if(!data.billing)throw Error('Please quit and reopen TutorTrack to activate student credit accounts.');}
async function mutate(action,payload,message){try{await api(action,payload);await refresh();render();toast(message);}catch(e){toast(e.message,true);}}
function navigate(next){if(dirty&&!confirm('Leave this note without saving your changes?'))return;dirty=false;noteDraft=null;route=next;search='';selectedStudent=null;selectedNote=null;render();}
function render(){
 const title=navItems.find(n=>n[0]===route)?.[2]||'Settings';
 $('#app').innerHTML=`<aside class="sidebar"><a class="brand" href="#overview"><img src="/icon.svg" alt="">TutorTrack<span class="brand-dot">.</span></a><div class="workspace-label">YOUR WORKSPACE</div><nav aria-label="Main navigation">${navItems.map(([key,symbol,label])=>`<button data-nav="${key}" class="nav-link ${route===key?'active':''}">${icon(symbol)}<span>${label}</span>${key==='accounts'&&charges().filter(c=>c.due>0).length?`<span class="nav-count">${charges().filter(c=>c.due>0).length}</span>`:''}</button>`).join('')}</nav><div class="sidebar-bottom"><div class="local-card">${icon('local')}<div><strong>Yours, and only yours</strong><span>Stored on this computer</span></div></div><button class="nav-link ${route==='settings'?'active':''}" data-nav="settings">${icon('settings')}<span>Settings & backup</span></button><div class="profile"><span class="profile-avatar">${icon('book')}</span><div><strong>My teaching space</strong><span>Personal workspace</span></div></div></div></aside><main><header class="topbar"><div class="breadcrumb">Workspace <span>/</span> <strong>${title}</strong></div><div class="topbar-right"><span class="today-label">${dateLabel(localDate(),{weekday:'short',day:'numeric',month:'long',year:'numeric'})}</span><button class="btn icon-btn" data-nav="settings" aria-label="Settings and backup">${icon('settings')}</button></div></header><div class="page" id="page">${page()}</div><footer>Your space to teach, plan, and keep track.<span>${icon('local')} Local storage</span></footer></main>`;
 if(route==='notes'&&selectedNote!==null)bindEditor();
 if(route==='calendar')bindCalendarScroll();
}
function page(){return ({overview,calendar,students,accounts,packs,notes,settings}[route]||overview)();}
function heading(eyebrow,title,subtitle,actions=''){return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${subtitle}</p></div><div class="heading-actions">${actions}</div></div>`;}
function stats(items){return `<div class="stats">${items.map(([symbol,label,value,detail,tone])=>`<div class="stat"><div class="stat-top"><span>${label}</span><span class="stat-icon ${tone||''}">${icon(symbol)}</span></div><strong>${value}</strong><div class="stat-detail">${detail}</div></div>`).join('')}</div>`;}
function overview(){
 const today=localDate(),month=today.slice(0,7), upcoming=data.lessons.filter(l=>l.status==='scheduled'&&l.start.slice(0,10)>=today).sort((a,b)=>a.start.localeCompare(b.start));
 const dayLessons=upcoming.filter(l=>l.start.startsWith(today)); const due=charges().filter(c=>c.due>0);const monthDone=data.lessons.filter(l=>l.status==='completed'&&l.start.startsWith(month));
 return heading('A LITTLE CLARITY FOR YOUR DAY','Room to focus on teaching.',"Your lessons, students, and the details in between.",button(icon('plus')+' Schedule lesson','new-lesson','','primary'))+
 fxNotice()+stats([['calendar','Today’s lessons',dayLessons.length,dayLessons.length?`${sum(dayLessons,'minutes')/60} hours planned`:'A little room to breathe','purple'],['students','Active students',data.students.filter(s=>!s.archived).length,'Learning, one lesson at a time','blue'],['wallet','Received this month',money(convertedTotal(data.payments.filter(p=>p.date.startsWith(month)),'amount')),`${monthDone.length} lessons completed`,'green'],['clock','Awaiting payment',money(convertedTotal(due,'due')),`${due.length} unpaid ${due.length===1?'item':'items'}`,'orange']])+
 `<div class="overview-grid"><section class="panel schedule-panel"><div class="panel-heading"><div><h2>Coming up</h2><p>Your next teaching moments</p></div><button class="text-btn" data-nav="calendar">View calendar ${icon('arrow')}</button></div>${upcoming.length?`<div class="lesson-list">${upcoming.slice(0,5).map(lessonRow).join('')}</div>`:empty('calendar','Your next chapter starts here','Add a student, then put your first lesson on the calendar.',button(icon('plus')+' '+(data.students.length?'Schedule a lesson':'Add your first student'),data.students.length?'new-lesson':'new-student','','primary'))}<div class="panel-bottom">${icon('clock')} All lesson times are in your computer’s local time.</div></section><div class="right-stack"><section class="panel quick-panel"><div class="panel-heading"><h2>Make a little progress</h2></div><div class="quick-actions">${[['students','New student','A new learning journey','new-student'],['pack','Sell a lesson pack','Give learning a little structure','new-pack'],['notes','Write a note','Keep the good ideas close','new-note']].map(([symbol,title,sub,action])=>`<button class="quick-action" data-action="${action}"><span class="quick-icon">${icon(symbol)}</span><span><strong>${title}</strong><small>${sub}</small></span>${icon('chevron')}</button>`).join('')}</div></section><section class="teaching-card"><div class="eyebrow">LESS BY HEART. MORE AT HAND.</div><div class="book-art">${icon('book')}</div><h2>A home for every<br>lightbulb moment.</h2><p>Lesson notes, useful links, and images — all together in your notebook.</p><button class="text-btn" data-nav="notes">Open notebook ${icon('arrow')}</button></section></div></div><section class="panel"><div class="panel-heading"><div><h2>Payments to follow up</h2><p>A clear view of what’s still due</p></div><button class="text-btn" data-nav="accounts">View accounts ${icon('arrow')}</button></div>${due.length?chargeTable(due.slice(0,4)): `<div class="all-clear">${icon('check')}<div><strong>Nothing outstanding</strong><span>Unpaid lessons will appear here. Pending pack payments are in Packs & credit.</span></div></div>`}</section>`;
}
function lessonRow(l){const s=student(l.student_id);return `<button class="lesson-row" data-action="lesson-detail" data-id="${l.id}"><div class="lesson-time"><strong>${time(l.start)}</strong><span>${dateLabel(l.start)}</span></div><span class="lesson-rule ${esc(s.color)}"></span>${avatar(s)}<div class="lesson-info"><strong>${esc(l.title)}</strong><span>${esc(s.name)} <i>·</i> ${l.minutes} min ${l.location?'<i>·</i> '+esc(l.location):''}</span></div>${badge(l.status==='completed'?'Completed':l.status==='cancelled'?'Cancelled':'Scheduled',l.status==='completed'?'green':l.status==='cancelled'?'neutral':'purple')}${icon('chevron')}</button>`;}
function badge(text,tone='neutral'){return `<span class="badge ${tone}">${text}</span>`;}
function weekStart(date){let d=new Date(date.getFullYear(),date.getMonth(),date.getDate());d.setDate(d.getDate()-((d.getDay()+6)%7));return d;}
function calendarPeriod(date,mode=calendarMode,step=0){
 if(mode==='month')return new Date(date.getFullYear(),date.getMonth()+step,1);
 const start=weekStart(date);return new Date(start.getFullYear(),start.getMonth(),start.getDate()+step*7);
}
function calendarPeriodAllowed(date,mode=calendarMode){
 const end=mode==='week'?new Date(date.getFullYear(),date.getMonth(),date.getDate()+6):date;
 return end>=new Date(2000,0,1)&&date<new Date(2101,0,1);
}
function calendarPeriods(date,mode=calendarMode){
 return Array.from({length:7},(_,i)=>calendarPeriod(date,mode,i-3)).filter(d=>calendarPeriodAllowed(d,mode));
}
function calendarRange(date,mode=calendarMode){
 if(mode==='month')return dateLabel(localDate(date),{month:'long',year:'numeric'});
 const begin=weekStart(date),end=new Date(begin.getFullYear(),begin.getMonth(),begin.getDate()+6);
 return `${dateLabel(localDate(begin))} – ${dateLabel(localDate(end),{month:'short',day:'numeric',year:'numeric'})}`;
}
function calendarSection(date){
 const begin=calendarPeriod(date),dates=Array.from({length:7},(_,i)=>new Date(begin.getFullYear(),begin.getMonth(),begin.getDate()+i));
 return `<section class="calendar-period" data-date="${localDate(begin)}" aria-label="${esc(calendarRange(begin))}"><h3 class="calendar-period-title">${calendarRange(begin)}</h3>${calendarMode==='week'?weekCalendar(dates):monthCalendar(begin)}</section>`;
}
function calendar(){
 return heading('MAKE TIME FOR GOOD TEACHING','Your calendar','Scroll up for earlier dates, down for later dates.',button(icon('plus')+' Schedule lesson','new-lesson','','primary'))+`<section class="panel calendar-panel"><div class="calendar-toolbar"><div class="calendar-controls">${button('Today','calendar-today')}${button(icon('back'),'calendar-prev','aria-label="Previous period"','icon-btn')}${button(icon('arrow'),'calendar-next','aria-label="Next period"','icon-btn')}<h2 id="calendar-range">${calendarRange(calendarDate)}</h2></div><div class="segmented">${button('Week','calendar-mode','data-mode="week"',calendarMode==='week'?'selected':'')}${button('Month','calendar-mode','data-mode="month"',calendarMode==='month'?'selected':'')}</div></div><div id="calendar-scroll" class="calendar-scroll" tabindex="0" role="region" aria-label="Calendar. Scroll for earlier or later dates.">${calendarPeriods(calendarDate).map(calendarSection).join('')}</div></section><div class="calendar-legend"><span><i class="legend-dot purple"></i> Scheduled</span><span><i class="legend-dot green"></i> Completed</span><span>Click a day to schedule a lesson</span></div>`;
}
function bindCalendarScroll(){
 const pane=$('#calendar-scroll');
 const sections=()=>Array.from(pane.querySelectorAll('.calendar-period'));
 const items=sections();if(!items.length)return;
 const target=items.find(el=>el.dataset.date===localDate(calendarPeriod(calendarDate)))||items[0];
 pane.scrollTop=target.offsetTop+calendarScrollOffset;
 pane.onscroll=()=>{
  // Retain the topmost visible period as an anchor; native overflow anchoring
  // is disabled so adding/removing rows cannot compensate a second time.
  const items=sections(),top=pane.scrollTop;
  const anchor=items.find(el=>el.offsetTop+el.offsetHeight>top+1)||items.at(-1);
  const offset=top-anchor.offsetTop;
  const from=el=>new Date(el.dataset.date+'T12:00:00');
  const atStart=top<250,atEnd=pane.scrollHeight-top-pane.clientHeight<250;
  if(atStart){
   const first=from(items[0]);
   for(let i=1;i<=2;i++){
    const earlier=calendarPeriod(first,calendarMode,-i);
    if(calendarPeriodAllowed(earlier))pane.insertAdjacentHTML('afterbegin',calendarSection(earlier));
   }
   while(pane.children.length>12&&pane.lastElementChild!==anchor)pane.lastElementChild.remove();
  }else if(atEnd){
   const last=from(items.at(-1));
   for(let i=1;i<=2;i++){
    const later=calendarPeriod(last,calendarMode,i);
    if(calendarPeriodAllowed(later))pane.insertAdjacentHTML('beforeend',calendarSection(later));
   }
   while(pane.children.length>12&&pane.firstElementChild!==anchor)pane.firstElementChild.remove();
  }
  if(atStart||atEnd)pane.scrollTop=anchor.offsetTop+offset;
  calendarDate=from(anchor);calendarScrollOffset=offset;
  $('#calendar-range').textContent=calendarRange(calendarDate);
 };
}
function calendarEvent(l){const s=student(l.student_id);return `<button class="calendar-event ${l.status==='completed'?'complete':esc(s.color)}" data-action="lesson-detail" data-id="${l.id}"><span>${time(l.start)} <span class="event-duration">· ${l.minutes}m</span>${l.status==='completed'?' ✓':''}</span><strong>${esc(s.name)}</strong><small>${esc(l.title)}</small></button>`;}
function weekCalendar(dates){return `<div class="week-grid">${dates.map(d=>{const key=localDate(d),lessons=data.lessons.filter(l=>l.start.startsWith(key)&&l.status!=='cancelled').sort((a,b)=>a.start.localeCompare(b.start));return `<div class="week-column ${key===localDate()?'is-today':''}"><button class="day-header" data-action="new-lesson" data-date="${key}"><span>${dateLabel(key,{weekday:'short'})}</span><strong>${d.getDate()}</strong></button><div class="day-events">${lessons.map(calendarEvent).join('')}<button class="add-slot" data-action="new-lesson" data-date="${key}" aria-label="Schedule a lesson on ${key}">${icon('plus')}<span>Add lesson</span></button></div></div>`;}).join('')}</div>`;}
function monthCalendar(date=calendarDate){const first=new Date(date.getFullYear(),date.getMonth(),1),begin=weekStart(first);return `<div class="month-grid">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<div class="month-weekday">${d}</div>`).join('')}${Array.from({length:42},(_,i)=>{const d=new Date(begin.getFullYear(),begin.getMonth(),begin.getDate()+i),key=localDate(d);return `<div class="month-cell ${d.getMonth()!==date.getMonth()?'outside':''} ${key===localDate()?'is-today':''}"><button class="month-day" data-action="new-lesson" data-date="${key}" aria-label="Schedule on ${key}">${d.getDate()}</button>${data.lessons.filter(l=>l.start.startsWith(key)&&l.status!=='cancelled').sort((a,b)=>a.start.localeCompare(b.start)).map(calendarEvent).join('')}</div>`;}).join('')}</div>`;}
function searchBox(placeholder){return `<label class="search-box">${icon('search')}<input id="search" type="search" placeholder="${placeholder}" value="${esc(search)}" aria-label="${placeholder}"></label>`;}
function students(){if(selectedStudent)return studentProfile();const list=data.students.filter(s=>(showArchived||!s.archived)&&[s.name,s.subject,s.email].join(' ').toLowerCase().includes(search.toLowerCase()));return heading('PEOPLE, BEFORE PAPERWORK','Your students','The little details that make teaching personal.',button(icon('plus')+' Add student','new-student','','primary'))+`<div class="filter-bar">${searchBox('Find a student…')}<label class="checkbox"><input type="checkbox" id="archived" ${showArchived?'checked':''}> Include archived</label><span class="muted">${list.length} students</span></div>${list.length?`<div class="student-grid">${list.map(s=>`<button class="student-card" data-action="student-profile" data-id="${s.id}"><div class="student-card-top">${avatar(s,'large')}${icon('arrow')}</div><h2>${esc(s.name)}</h2><p>${esc(s.subject)||'No subject yet'} ${s.archived?'· Archived':''}</p><div class="student-card-details"><div><span>Hourly rate</span><strong>${money(s.rate,currencyOf(s))}<small> / hr</small></strong></div><div><span>${balanceLabel(s.id)} (${esc(data.settings.currency)})</span><strong class="${accountAmount(s.id,'due')>0?'amount-due':''}">${balanceDisplay(s.id)}</strong></div></div><div class="student-card-footer">${icon('calendar')} ${data.lessons.filter(l=>l.student_id===s.id&&l.status==='completed').length} lessons completed</div></button>`).join('')}</div>`:empty('students',search?'No students found':'Every student starts a story',search?'Try a different name or subject.':'Keep contact details, lesson history, and balances in one place.',!search?button(icon('plus')+' Add your first student','new-student','','primary'):'')}`;}
function studentProfile(){const s=student(selectedStudent),lessons=data.lessons.filter(l=>l.student_id===s.id).sort((a,b)=>b.start.localeCompare(a.start)),sn=data.notes.filter(n=>n.student_id===s.id);return `<button class="text-btn back-link" data-nav="students">${icon('back')} All students</button>`+heading('STUDENT PROFILE',esc(s.name),esc(s.subject)||'Make the next lesson count.',button('Record payment / credit','student-payment',`data-student="${s.id}"`)+button(icon('edit')+' Edit student','edit-student',`data-id="${s.id}"`)+(!s.archived?button(icon('plus')+' Schedule lesson','new-lesson',`data-student="${s.id}"`,'primary'):''))+stats([['wallet','Hourly rate',money(s.rate,currencyOf(s)),'Charged when completed','purple'],['clock',`${balanceLabel(s.id)} (${esc(data.settings.currency)})`,balanceDisplay(s.id),esc(originalBalances(s.id)),'orange'],['check','Lessons completed',lessons.filter(l=>l.status==='completed').length,`${sum(lessons.filter(l=>l.status==='completed'),'minutes')/60} hours of learning`,'green']])+`<div class="profile-grid"><div><section class="panel"><div class="panel-heading"><h2>Lesson history</h2></div>${lessons.length?lessons.map(lessonRow).join(''):empty('calendar','A fresh start','Scheduled and completed lessons will appear here.')}</section><section class="panel"><div class="panel-heading"><h2>Student notes</h2>${button(icon('plus')+' Add note','new-note',`data-student="${s.id}"`)}</div>${sn.length?sn.map(n=>`<button class="note-list-row" data-action="open-note" data-id="${n.id}">${icon('notes')}<div><strong>${esc(n.title)}</strong><span>Updated ${dateLabel(n.updated)}</span></div>${icon('arrow')}</button>`).join(''):empty('notes','A place for progress','Capture goals, lesson summaries, and useful resources.')}</section></div><div><section class="panel contact-card"><h2>Contact & details</h2><label>Email</label><div>${esc(s.email)||'Not added'}</div><label>Phone</label><div>${esc(s.phone)||'Not added'}</div><label>About this student</label><div class="pre-wrap">${esc(s.details)||'Add learning goals, a parent’s contact, or other useful details.'}</div></section><section class="panel contact-card"><h2>Lesson packs</h2>${data.packs.filter(p=>p.student_id===s.id).map(p=>`<div class="mini-pack"><strong>${esc(p.name)}</strong><span>${money(paid('pack',p.id),currencyOf(p))} received of ${money(p.price,currencyOf(p))}</span></div>`).join('')||'<p class="muted">No credit packs yet.</p>'}${!s.archived?button(icon('plus')+' Sell a pack','new-pack',`data-student="${s.id}"`):''}</section></div></div>`;}
function chargeTable(items){return `<div class="table-wrap"><table><thead><tr><th>Student / item</th><th>Date</th><th>Total</th><th>Remaining</th><th>Status</th><th></th></tr></thead><tbody>${items.map(c=>{const s=student(c.student_id);return `<tr><td><div class="table-student">${avatar(s)}<div><strong>${esc(s.name)}</strong><span>${esc(c.title)}</span></div></div></td><td>${dateLabel(c.date)}</td><td>${money(c.total,currencyOf(c))}${equivalent(c.total,currencyOf(c))}</td><td class="${c.due?'amount-due':''}">${money(c.due,currencyOf(c))}${equivalent(c.due,currencyOf(c))}</td><td>${badge(c.due?(c.paid?'Partly paid':'To pay'):'Paid',c.due?'orange':'green')}</td><td>${c.due?button('Record payment','pay',`data-kind="${c.kind}" data-id="${c.id}"`,'small'):icon('check')}</td></tr>`;}).join('')}</tbody></table></div>`;}
function accounts(){const items=charges(),due=items.filter(c=>c.due>0);return heading('THE NUMBERS, NICELY IN ORDER','Your accounts','Know what you’ve earned and what’s still on its way.',button('Record payment / credit','student-payment')+`<a class="btn secondary" href="/api/export">${icon('download')} Export CSV</a>`)+fxNotice()+stats([['wallet','Total received',money(convertedTotal(data.payments,'amount')),'All recorded payments','green'],['clock','Outstanding balance',money(convertedTotal(due,'due')),`${due.length} items awaiting payment`,'orange'],['wallet','Credit available',money(convertedTotal(data.billing?.accounts||[],'credit')),'For future lessons','green'],['book','Total billed',money(convertedTotal(items,'total')),'Completed lessons only','purple']])+`<section class="panel"><div class="panel-heading"><div class="tabs">${[['due','To pay',due.length],['all','All charges',items.length],['payments','Payment history',data.payments.length]].map(([key,label,count])=>`<button data-action="account-tab" data-tab="${key}" class="tab ${accountTab===key?'active':''}">${label}<span>${count}</span></button>`).join('')}</div></div>${accountTab==='payments'?paymentTable():((accountTab==='due'?due:items).length?chargeTable(accountTab==='due'?due:items):empty('wallet',accountTab==='due'?'All settled up':'Your accounts start here',accountTab==='due'?'There are no outstanding payments.':'Complete a lesson to create your first charge.'))}</section><p class="help-text">${icon('book')} Received payments cover completed lessons, oldest first within each currency. Remaining credit covers future lessons. Pack purchases are not extra lesson charges.</p>`;}
function paymentTable(){return data.payments.length?`<div class="table-wrap"><table><thead><tr><th>Student / item</th><th>Received on</th><th>Method</th><th>Amount</th><th></th></tr></thead><tbody>${[...data.payments].reverse().map(p=>{const item=p.pack_id?data.packs.find(k=>k.id===p.pack_id):p.lesson_id?data.lessons.find(l=>l.id===p.lesson_id):null;return `<tr><td><strong>${esc(student(p.student_id).name)}</strong><span class="cell-secondary">${esc(item?.name||item?.title||'Student account credit')}</span></td><td>${dateLabel(p.date)}</td><td>${esc(p.method)}</td><td>${money(p.amount,currencyOf(p))}${equivalent(p.amount,currencyOf(p))}</td><td>${button('Undo','undo-payment',`data-id="${p.id}"`,'small')}</td></tr>`;}).join('')}</tbody></table></div>`:empty('wallet','No payments recorded yet','Record money received to pay past lessons or add credit for future lessons.');}
function packs(){return heading('PAYMENTS THAT GO FURTHER','Packs & credit','Packs add money to the student account. Every lesson uses its recorded price.',button(icon('plus')+' Sell a credit pack','new-pack','','primary'))+(data.packs.length?`<div class="pack-grid">${[...data.packs].reverse().map(p=>{const s=student(p.student_id),received=paid('pack',p.id),due=p.price-received;return `<section class="panel pack-card"><div class="pack-card-top"><span class="pack-symbol">${icon('pack')}</span>${badge(due?'Awaiting payment':'Payment received',due?'orange':'green')}</div><h2>${esc(p.name)}</h2><button class="pack-student" data-action="student-profile" data-id="${s.id}">${avatar(s)} ${esc(s.name)}</button><div class="pack-price"><div><strong>${money(p.price,currencyOf(p))}</strong>${equivalent(p.price,currencyOf(p))}<span>${p.quantity} × ${p.minutes} min (description only)</span></div></div><p>${money(received,currencyOf(p))} received · ${money(due,currencyOf(p))} awaiting payment</p><p class="help-text">Student account: ${esc(originalBalances(s.id))}. Received credit is shared across all this student's lessons in the same currency.</p>${due?button('Record payment','pay',`data-kind="pack" data-id="${p.id}"`,'primary'):''}${!s.archived?button(icon('calendar')+' Schedule lesson','new-lesson',`data-student="${s.id}"`):''}</section>`;}).join('')}</div>`:empty('pack','Credit for the next chapter','Record a pack payment to cover earlier lessons and keep the rest as credit.',button(icon('plus')+' Sell a credit pack','new-pack','','primary')));}
function notes(){const list=data.notes.filter(n=>[n.title,n.body,student(n.student_id)?.name].join(' ').toLowerCase().includes(search.toLowerCase()));return heading('KEEP THE LIGHTBULB MOMENTS','Your notebook','Ideas, progress, and everything worth remembering.',button(icon('plus')+' New note','new-note','','primary'))+`<section class="panel notebook"><aside class="notes-sidebar">${searchBox('Search your notes…')}<div class="note-items">${list.map(n=>`<button class="note-item ${selectedNote===n.id?'active':''}" data-action="open-note" data-id="${n.id}"><strong>${icon('notes')}${esc(n.title)}</strong><span>${esc(student(n.student_id)?.name||'General note')} · ${dateLabel(n.updated)}</span><p>${esc(n.body.replace(/[#*\[\]`]/g,'').slice(0,80))||'A new page, ready for your thoughts.'}</p></button>`).join('')||'<p class="no-notes">'+(search?'No matching notes.':'Your notes will live here.')+'</p>'}</div></aside><div class="note-workspace">${selectedNote!==null?editor():empty('notes','A little space to think','Choose a note or start a new one. Add Markdown, [[note links]], and images.',button(icon('plus')+' Write a note','new-note','','primary'))}</div></section>`;}
function editor(){const n=noteDraft||data.notes.find(n=>n.id===selectedNote);if(!n)return '';return `<div class="editor-top"><div><span class="eyebrow">${esc(student(n.student_id)?.name||'GENERAL NOTE')}</span>${n.lesson_id?'<span class="badge purple">Lesson note</span>':''}</div><div class="editor-actions"><span id="save-status">${dirty?'Unsaved changes':'Saved locally'}</span>${button(icon('check')+' Save note','save-note','','primary')}</div></div><input id="note-title" class="note-title" aria-label="Note title" placeholder="Untitled note" value="${esc(n.title)}"><div class="editor-toolbar"><div class="segmented"><button class="btn selected" data-action="note-mode" data-mode="write">Write</button><button class="btn" data-action="note-mode" data-mode="preview">Preview</button></div><div class="format-actions"><button data-action="format" data-format="bold" aria-label="Bold"><b>B</b></button><button data-action="format" data-format="italic" aria-label="Italic"><i>I</i></button><button data-action="format" data-format="heading" aria-label="Heading">H</button><button data-action="format" data-format="link" aria-label="Insert link">↗</button><button data-action="attach" aria-label="Attach image">${icon('image')}</button></div></div><textarea id="note-body" class="note-body" spellcheck="true" placeholder="# Today’s lesson&#10;&#10;What clicked? What needs a little more practice?&#10;&#10;- Goals&#10;- Key ideas&#10;- Next steps&#10;&#10;Link notes with [[Note title]]. Paste or attach an image.">${esc(n.body)}</textarea><article id="note-preview" class="markdown" hidden></article><input type="file" id="image-file" accept="image/png,image/jpeg,image/gif,image/webp" hidden><div class="editor-hint">Markdown supported <span>⌘ / Ctrl + S to save · Paste images directly</span></div>`;}
function settings(){return heading('MAKE YOURSELF AT HOME','Settings & backup','A few details to keep your workspace running smoothly.')+fxNotice()+`<div class="settings-grid"><section class="panel settings-card"><span class="settings-icon">${icon('wallet')}</span><h2>Your preferred currency</h2><p>Used to convert summary totals. Set each student’s billing currency in their profile.</p><form id="currency-form"><label for="currency">Summary currency</label><select id="currency" name="currency">${currencyOptions(data.settings.currency)}</select><p class="help-text">Change this anytime. Existing rates, charges, and payments keep their original currency.</p><button class="btn primary">Save preferred currency</button></form></section><section class="panel settings-card"><span class="settings-icon">${icon('clock')}</span><h2>Time format</h2><p>Choose how lesson times appear in your calendar, lesson lists, and scheduling form.</p><form id="time-format-form"><label for="time-format">Clock format</label><select id="time-format" name="time_format"><option value="24" ${data.settings.time_format!=='12'?'selected':''}>24-hour (14:30)</option><option value="12" ${data.settings.time_format==='12'?'selected':''}>12-hour (2:30 PM)</option></select><p class="help-text">You can change this anytime. Your scheduled lesson times stay the same.</p><button class="btn primary">Save time format</button></form></section><section class="panel settings-card"><span class="settings-icon">${icon('local')}</span><h2>Local. Personal. Yours.</h2><p>Your students, lessons, and notes are saved in a SQLite database on this computer. Uploaded images stay here too.</p><div class="storage-path">data/tutortrack.sqlite3<br>data/uploads/</div><h3>Keep a copy somewhere safe</h3><p>Download a full backup with your database and uploaded images. Keep a copy on another drive.</p><a href="/api/backup" class="btn primary">${icon('download')} Download backup</a><details><summary>How to restore a backup</summary><p>Stop TutorTrack, keep a copy of your current data folder, then unzip the backup into the project’s data folder. Restart the app. The README has the same instructions.</p></details></section></div>`;}
function showDialog(title,subtitle,body,submit='Save',formId='modal-form'){dialogBack=null;const dialog=$('#dialog');dialog.innerHTML=`<form id="${formId}"><div class="modal-header"><div><h2>${title}</h2><p>${subtitle}</p></div><button type="button" class="btn icon-btn" data-action="close-modal" aria-label="Close">${icon('close')}</button></div><div class="modal-body">${body}<p class="form-error" role="alert" hidden></p></div>${submit?`<div class="modal-footer"><button type="button" class="btn secondary" data-action="close-modal">Cancel</button><button class="btn primary" type="submit">${submit}</button></div>`:''}</form>`;dialog.showModal();}
const field=(label,name,value='',type='text',extra='')=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const studentSelect=(id,includeArchived=false)=>`<label>Student<select name="student_id" required><option value="">Choose a student</option>${data.students.filter(s=>includeArchived||!s.archived).map(s=>`<option value="${s.id}" ${s.id===Number(id)?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label>`;
function studentForm(id,onSaved){const s=student(id)||{};showDialog(id?'Edit student':'A new learning journey','Keep the details that help you teach.',`<input type="hidden" name="id" value="${s.id||''}">${field('Full name','name',s.name,'text','required maxlength="300" autocomplete="name"')}${field('Subject / level','subject',s.subject,'text','placeholder="e.g. Mathematics · Year 10"')}<div class="form-grid">${field('Email','email',s.email,'email','autocomplete="email"')}${field('Phone','phone',s.phone,'tel','autocomplete="tel"')}</div><div class="form-grid"><label>Billing currency<select name="currency">${currencyOptions(s.currency||data.settings.currency)}</select></label>${field('Hourly rate (selected currency)','rate',s.rate!==undefined?s.rate/100:'','number','min="0" max="1000000" step="0.01" required')}<label>Calendar color<select name="color">${['purple','blue','orange','green','pink'].map(c=>`<option value="${c}" ${c===s.color?'selected':''}>${c[0].toUpperCase()+c.slice(1)}</option>`).join('')}</select></label></div><p class="help-text">Changing currency applies to new lessons and packs. Enter the hourly rate in the selected currency; existing records keep their currency.</p><label>Useful details<textarea name="details" rows="3" placeholder="Learning goals, parent’s contact, things to remember…">${esc(s.details)}</textarea></label>${s.id?`<label class="checkbox"><input type="checkbox" name="archived" ${s.archived?'checked':''}> Archive student (keep all history)</label>`:''}`,id?'Save changes':'Add student');const form=$('#modal-form');const updateCurrency=()=>{form.elements.rate.step=currencyStep(form.elements.currency.value);};form.elements.currency.onchange=updateCurrency;updateCurrency();form.onsubmit=e=>submitForm(e,'student','Student saved',f=>({...f,archived:!!f.archived}),onSaved);}
function lessonTimeFields(start){
 const hour=Number(start.slice(11,13)),minute=Number(start.slice(14,16)),twelve=data.settings.time_format==='12';
 const selectedHour=twelve?(hour%12||12):hour;
 return `<fieldset class="lesson-time-fields"><legend>Start time (${twelve?'12':'24'}-hour)</legend><div class="form-grid"><label>Hour<select name="lesson_hour" required>${Array.from({length:twelve?12:24},(_,i)=>i+(twelve?1:0)).map(h=>`<option value="${h}" ${h===selectedHour?'selected':''}>${String(h).padStart(2,'0')}</option>`).join('')}</select></label>${field('Minute','lesson_minute',String(minute).padStart(2,'0'),'number','min="0" max="59" step="1" required')}${twelve?`<label>AM / PM<select name="lesson_period"><option value="AM" ${hour<12?'selected':''}>AM</option><option value="PM" ${hour>=12?'selected':''}>PM</option></select></label>`:''}</div></fieldset>`;
}
function lessonStart(fields){
 let hour=Number(fields.lesson_hour);
 if(fields.lesson_period)hour=hour%12+(fields.lesson_period==='PM'?12:0);
 return `${fields.lesson_date}T${String(hour).padStart(2,'0')}:${String(fields.lesson_minute).padStart(2,'0')}`;
}
function lessonForm(attrs={}){
 const draft=attrs.draft;
 const lessonId=draft?.id||attrs.id;
 const l=lessonId?data.lessons.find(l=>l.id===Number(lessonId)):null;
 const sid=draft?.student_id??l?.student_id??attrs.student??'';
 let repeatRequested=draft?.repeat_requested==='yes'||!l?.series_id;
 const hasFutureLessons=!!l&&followingLessons(l).length>0;
 let d=new Date();d.setMinutes(0,0,0);d.setHours(d.getHours()+1);
 const start=l?.start||(attrs.date||localDate(d))+'T'+String(d.getHours()).padStart(2,'0')+':00';
 showDialog(l?'Edit lesson':'Make time for a lesson','Plan the next step in their learning.',`<input type="hidden" name="id" value="${l?.id||''}">${studentSelect(sid)}<button type="button" class="text-btn add-lesson-student" data-action="new-lesson-student">${icon('plus')} Add new student</button>${field('Lesson title','title',l?.title||student(sid)?.subject||'','text','required maxlength="300" placeholder="e.g. Algebra · Quadratic equations"')}<div class="form-grid">${field('Date','lesson_date',start.slice(0,10),'date','required min="2000-01-01" max="2100-12-31"')}${field('Duration (minutes)','minutes',l?.minutes||60,'number','min="5" max="720" required')}</div>${lessonTimeFields(start)}<div class="repeat-section"><label>Repeat<select name="repeat"><option value="none">${l?.series_id?'No additional repeats':'Does not repeat'}</option><option value="weekly">Repeat weekly</option></select></label><div id="repeat-options" hidden>${field('Total lessons (including this one)','repeat_count',4,'number','min="2" max="52" step="1" required disabled')}<p id="repeat-summary" class="help-text"></p><p class="help-text">Each lesson can be edited, cancelled, completed, and paid separately. All dates must be free. Available credit is used only when a lesson is completed.</p></div></div><div id="rate-field">${field('Hourly rate','rate',(l?.rate??student(sid)?.rate??0)/100,'number','min="0" max="1000000" step="0.01" required')}</div><p class="billing-hint" id="billing-hint"></p>${field('Location / meeting link','location',l?.location||'','text','placeholder="e.g. Online · https://meet…"')}`,l?'Save changes':'Schedule lesson');
 const form=$('#modal-form');
 // Restore the in-progress lesson after adding a student or going back.
 if(draft)for(const [name,value] of Object.entries(draft)){
  if(form.elements[name])form.elements[name].value=value;
 }
 const updateBilling=()=>{
  const chosen=student(form.elements.student_id.value);
  const currency=(l&&l.student_id===chosen?.id?l.currency:chosen?.currency)||data.settings.currency;
  const rateLabel=$('#rate-field label');if(rateLabel)rateLabel.firstChild.textContent=`Hourly rate (${currency})`;
  form.elements.rate.disabled=false;
  form.elements.rate.step=currencyStep(currency);

  $('#billing-hint').textContent=`${money(Math.round(Number(form.elements.rate.value)*100*Number(form.elements.minutes.value)/60),currency)} · Charged when completed; available student credit applies automatically.`;
 };
 updateBilling();
 form.elements.student_id.onchange=()=>{
  const s=student(form.elements.student_id.value);form.elements.rate.value=(l&&s?.id===l.student_id?l.rate:s?.rate||0)/100;
  if(!l)form.elements.title.value=s?.subject||'';
  updateBilling();
 };
 form.elements.minutes.oninput=updateBilling;form.elements.rate.oninput=updateBilling;
 if(l?.series_id&&hasFutureLessons&&!draft){
  form.elements.repeat.value='weekly';
  const dates=data.lessons.filter(item=>item.series_id===l.series_id&&item.start>=l.start).map(item=>new Date(item.start).getTime());
  const span=Math.round((Math.max(...dates)-new Date(l.start).getTime())/(7*86400000))+1;
  form.elements.repeat_count.value=Math.min(52,span>1?span:4);
 }
 const initialRepeat=form.elements.repeat.value;
 const initialCount=form.elements.repeat_count.value;
 const wantsWeeklyDates=()=>form.elements.repeat.value==='weekly'&&(repeatRequested||!hasFutureLessons||form.elements.repeat.value!==initialRepeat||form.elements.repeat_count.value!==initialCount);
 const updateRepeat=()=>{
  const weekly=form.elements.repeat.value==='weekly';
  $('#repeat-options').hidden=!weekly;form.elements.repeat_count.disabled=!weekly;
  const count=Number(form.elements.repeat_count.value);
  form.querySelector('[type="submit"]').textContent=wantsWeeklyDates()&&Number.isInteger(count)&&count>=2&&count<=52?(l?'Save & schedule weekly lessons':`Schedule ${count} lessons`):(l?'Save changes':'Schedule lesson');
  const date=form.elements.lesson_date.value;
  if(weekly&&date&&Number.isInteger(count)&&count>=2&&count<=52){
   const end=new Date(date+'T12:00');end.setDate(end.getDate()+7*(count-1));
   $('#repeat-summary').textContent=`${l?.series_id&&hasFutureLessons&&!wantsWeeklyDates()?'This lesson belongs to a weekly series. Existing dates are already on your calendar. Change the count to schedule missing dates. ':''}${count} lessons, every ${dateLabel(date,{weekday:'long'})}, from ${dateLabel(date)} to ${dateLabel(localDate(end),{month:'short',day:'numeric',year:'numeric'})}. The same local time is kept each week.`;
  }else $('#repeat-summary').textContent='Choose 2–52 lessons and a start date.';
 };
 form.elements.repeat.onchange=()=>{repeatRequested=true;updateRepeat();};form.elements.repeat_count.oninput=()=>{repeatRequested=true;updateRepeat();};form.elements.lesson_date.onchange=updateRepeat;updateRepeat();
 form.dataset.repeatRequested=repeatRequested?'yes':'no';
 form.addEventListener('input',()=>{form.dataset.repeatRequested=repeatRequested?'yes':'no';});
 form.elements.repeat.addEventListener('change',()=>{form.dataset.repeatRequested=repeatRequested?'yes':'no';});
 form.onsubmit=async e=>{
  e.preventDefault();
  const submit=form.querySelector('[type="submit"]');submit.disabled=true;
  try{
   // A one-off lesson has no future edits to confirm: saving creates its repeats directly.
   const scope=hasFutureLessons?await chooseLessonScope(l):'single';
   if(!scope)return;
   await submitForm({preventDefault(){},currentTarget:form},'lesson',result=>result.updated_count?`${result.updated_count} lessons updated${result.created_count?' · '+result.created_count+' future lessons created':''}`:result.count>1?(l?`Lesson updated · ${result.created_count} new weekly lessons created`:`${result.count} weekly lessons scheduled`):l?'Lesson updated':'Lesson scheduled',f=>({...f,start:lessonStart(f),repeat_count:wantsWeeklyDates()?f.repeat_count:1,edit_scope:scope}));
  }finally{submit.disabled=false;}
 };

}
function followingLessons(lesson){
 return lesson.series_id?data.lessons.filter(item=>item.id!==lesson.id&&item.series_id===lesson.series_id&&item.status==='scheduled'&&item.start>=lesson.start):[];
}
function chooseLessonScope(lesson){
 const following=followingLessons(lesson),dialog=$('#scope-dialog');
 return new Promise(resolve=>{
  dialog.innerHTML=`<div class="modal-header"><div><h2 id="scope-title">Apply changes to future lessons?</h2><p>${esc(student(lesson.student_id).name)} · ${esc(lesson.title)}</p></div></div><div class="modal-body"><p>${following.length?`There ${following.length===1?'is':'are'} ${following.length} later planned ${following.length===1?'lesson':'lessons'} in this weekly series.`:'There are no later planned lessons in this series.'}</p><p class="help-text">Only the fields you changed will be applied. Changing the date or time shifts later lessons by the same amount. Completed and cancelled lessons are excluded.</p></div><div class="modal-footer scope-actions"><button type="button" class="btn secondary" id="scope-back">Back</button><button type="button" class="btn secondary" id="scope-single">No, only this lesson</button><button type="button" class="btn primary" id="scope-following" ${following.length?'':'disabled'}>Yes, this and future lessons</button></div>`;
  const finish=scope=>{dialog.close();resolve(scope);};
  $('#scope-back').onclick=()=>finish(null);
  $('#scope-single').onclick=()=>finish('single');
  $('#scope-following').onclick=()=>finish('following');
  dialog.oncancel=event=>{event.preventDefault();finish(null);};
  dialog.showModal();
 });
}
function addStudentFromLesson(){
 const draft={...Object.fromEntries(new FormData($('#modal-form'))),repeat_requested:$('#modal-form').dataset.repeatRequested};
 studentForm(undefined,result=>{
  const created=student(result.id);
  lessonForm({draft:{...draft,student_id:String(created.id),rate:String(created.rate/100),pack_id:'',title:draft.title||created.subject}});
 });
 dialogBack=()=>lessonForm({draft});
 $('#modal-form .modal-footer [data-action="close-modal"]').textContent='Back to lesson';
}
function closeModal(){
 if(dialogBack){const back=dialogBack;dialogBack=null;back();}
 else $('#dialog').close();
}
document.addEventListener('cancel',event=>{
 if(event.target.id==='dialog'&&dialogBack){event.preventDefault();closeModal();}
},true);

function receiptFields(){return `<div class="form-grid">${field('Received on','date',localDate(),'date','required')}<label>Method<select name="method">${['Bank transfer','Cash','TWINT','Card','Other'].map(m=>`<option>${m}</option>`).join('')}</select></label></div>`;}
function packForm(sid){
 if(!data.students.some(s=>!s.archived)){studentForm();toast('Add your first student, then create a credit pack.');return;}
 showDialog('Sell a credit pack','Money received covers past lessons first, then future lessons.',`${studentSelect(sid)}${field('Pack name','name','','text','required placeholder="e.g. Mathematics · 10-lesson credit"')}<div class="form-grid">${field('Number of lessons (description)','quantity',10,'number','min="1" max="1000" required')}${field('Minutes per lesson (description)','minutes',60,'number','min="5" max="720" required')}</div>${field('Total credit pack amount','price','','number','min="0.01" max="1000000" step="0.01" required')}<label>Payment status<select name="received"><option value="yes">Payment received — add credit now</option><option value="no">Awaiting payment — no credit yet</option></select></label><div id="receipt-fields">${receiptFields()}</div><p class="billing-hint">The amount received becomes credit, not a fixed number of sessions. Each completed lesson is deducted at its saved price, in the same currency.</p>`,'Save credit pack');
 const form=$('#modal-form'),label=form.elements.price.parentElement;
 const updateCurrency=()=>{const currency=currencyOf(student(form.elements.student_id.value));label.firstChild.textContent=`Total credit pack amount (${currency})`;form.elements.price.step=currencyStep(currency);form.elements.price.min=currencyStep(currency);};
 form.elements.student_id.onchange=updateCurrency;updateCurrency();
 form.elements.received.onchange=()=>{const pending=form.elements.received.value==='no';$('#receipt-fields').hidden=pending;form.elements.date.disabled=pending;form.elements.method.disabled=pending;};
 form.onsubmit=e=>submitForm(e,'pack','Credit pack saved',f=>({...f,received:f.received==='yes'}));
}
function studentPaymentForm(sid){
 showDialog('Record payment / credit','Pay earlier lessons and keep any remainder for future lessons.',`${studentSelect(sid,true)}<label>Payment currency<select name="currency">${currencyOptions(currencyOf(student(sid)))}</select></label>${field('Amount received','amount','','number','min="0.01" max="1000000" step="0.01" required')}${receiptFields()}<p class="help-text">If this payment is for an existing pack, use “Record payment” on that pack so its payment status stays up to date. Do not record the same receipt twice.</p>`,'Record payment');
 const form=$('#modal-form');const update=()=>{form.elements.amount.step=currencyStep(form.elements.currency.value);form.elements.amount.min=currencyStep(form.elements.currency.value);};
 form.elements.student_id.onchange=()=>{form.elements.currency.value=currencyOf(student(form.elements.student_id.value));update();};form.elements.currency.onchange=update;update();
 form.onsubmit=e=>submitForm(e,'payment','Payment recorded',f=>({...f,kind:'student',id:f.student_id}));
}
function paymentForm(kind,id){
 const p=kind==='pack'?data.packs.find(p=>p.id===Number(id)):null;
 const c=p?{...p,title:p.name,due:p.price-paid('pack',p.id)}:charges().find(c=>c.id===Number(id));
 showDialog('A payment received','Available credit automatically covers earlier unpaid lessons.',`<div class="payment-summary"><strong>${esc(student(c.student_id).name)}</strong><span>${esc(c.title)}</span><p>Remaining amount <b>${money(c.due,currencyOf(c))}</b></p></div><input type="hidden" name="kind" value="${kind}"><input type="hidden" name="id" value="${id}">${field(`Amount received (${currencyOf(c)})`,'amount',(c.due/100).toFixed(2),'number',`required min="${currencyStep(currencyOf(c))}" max="${c.due/100}" step="${currencyStep(currencyOf(c))}"`)}${receiptFields()}`,'Record payment');$('#modal-form').onsubmit=e=>submitForm(e,'payment','Payment recorded');
}
function lessonDetail(id){const l=data.lessons.find(l=>l.id===Number(id)),s=student(l.student_id),c=charges().find(c=>c.kind==='lesson'&&c.id===l.id);showDialog(esc(l.title),esc(s.name),`<div class="detail-status">${badge(l.status[0].toUpperCase()+l.status.slice(1),l.status==='completed'?'green':'purple')}${badge(c?(c.due?'To pay':c.credit_applied?'Paid with credit':'Paid'):'Charged on completion',c?.due?'orange':'neutral')}</div><div class="detail-grid"><div><span>Date</span><strong>${dateLabel(l.start,{weekday:'long',month:'long',day:'numeric'})}</strong></div><div><span>Time</span><strong>${time(l.start)} · ${l.minutes} min</strong></div><div><span>Location</span><strong>${esc(l.location)||'Not specified'}</strong></div><div><span>Lesson price</span><strong>${money(l.amount,currencyOf(l))}</strong></div></div><div class="detail-actions">${l.status==='scheduled'?button(icon('check')+' Mark completed','lesson-status',`data-id="${l.id}" data-status="completed"`,'primary')+button(icon('edit')+' Edit lesson','edit-lesson',`data-id="${l.id}"`):''}${c?.due?button('Record payment','pay',`data-kind="lesson" data-id="${l.id}"`,'primary'):''}${button(icon('notes')+' Lesson notes','lesson-note',`data-id="${l.id}"`)}${l.status==='completed'&&!paid('lesson',l.id)?button('Reopen lesson','lesson-status',`data-id="${l.id}" data-status="scheduled"`):''}${l.status==='scheduled'?button('Cancel lesson','lesson-status',`data-id="${l.id}" data-status="cancelled"`,'danger'):''}</div>`,null);}
async function submitForm(e,action,message,transform=f=>f,onSaved){e.preventDefault();const form=e.currentTarget,submit=form.querySelector('[type="submit"]'),error=$('.form-error',form);submit.disabled=true;error.hidden=true;try{const result=await api(action,transform(Object.fromEntries(new FormData(form))));await refresh();dialogBack=null;$('#dialog').close();render();if(onSaved)onSaved(result);toast(typeof message==='function'?message(result):message);}catch(err){error.textContent=err.message;error.hidden=false;}finally{submit.disabled=false;}}
function newNote(sid,lessonId){if(dirty&&!confirm('Discard your unsaved note changes?'))return;$('#dialog').close();showDialog('A new page','A place for what’s worth remembering.',`${studentSelect(sid)}${field('Note title','title','','text','required placeholder="e.g. Fractions · Building confidence"')}<p class="help-text">Leave the student blank for a general note.</p>`,'Create note');$('#modal-form [name="student_id"]').required=false;$('#modal-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,btn=$('[type="submit"]',f);btn.disabled=true;try{const result=await api('note',{...Object.fromEntries(new FormData(f)),lesson_id:lessonId||null,body:''});await refresh();$('#dialog').close();route='notes';selectedNote=result.id;noteDraft=null;dirty=false;search='';render();$('#note-body').focus();}catch(err){$('.form-error',f).hidden=false;$('.form-error',f).textContent=err.message;btn.disabled=false;}};}
async function openLessonNote(id){const existing=data.notes.find(n=>n.lesson_id===Number(id));if(existing){openNote(existing.id);return;}const l=data.lessons.find(l=>l.id===Number(id));try{const result=await api('note',{title:`${l.title} · ${dateLabel(l.start)}`,student_id:l.student_id,lesson_id:l.id,body:'# Lesson notes\n\n## What we covered\n\n\n## Next steps\n\n- '});await refresh();openNote(result.id);}catch(e){toast(e.message,true);}}
function openNote(id){if(dirty&&!confirm('Leave this note without saving?'))return;$('#dialog').close();route='notes';selectedNote=Number(id);noteDraft=null;dirty=false;render();}
function bindEditor(){noteDraft={...(noteDraft||data.notes.find(n=>n.id===selectedNote))};const change=()=>{noteDraft.title=$('#note-title').value;noteDraft.body=$('#note-body').value;dirty=true;$('#save-status').textContent='Unsaved changes';};$('#note-title').oninput=change;$('#note-body').oninput=change;$('#note-body').onpaste=async e=>{const file=[...e.clipboardData.items].find(i=>i.type.startsWith('image/'))?.getAsFile();if(file){e.preventDefault();await attachImage(file);}};$('#image-file').onchange=e=>{if(e.target.files[0])attachImage(e.target.files[0]);};}
async function saveNote(){if(!noteDraft)return;const saving={...noteDraft};try{await api('note',saving);await refresh();if(noteDraft&&noteDraft.id===saving.id&&noteDraft.body===saving.body&&noteDraft.title===saving.title){dirty=false;$('#save-status').textContent='Saved locally';}toast('Note saved');}catch(e){toast(e.message,true);}}
function insertText(before,after='',fallback=''){const area=$('#note-body');const selected=area.value.slice(area.selectionStart,area.selectionEnd)||fallback;area.setRangeText(before+selected+after,area.selectionStart,area.selectionEnd,'end');area.dispatchEvent(new Event('input'));area.focus();}
async function attachImage(file){if(file.size>10000000){toast('Choose an image smaller than 10 MB.',true);return;}const noteId=selectedNote;try{const encoded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});const result=await api('upload',{data:encoded});if(selectedNote!==noteId){toast('Image uploaded. Reopen your note to attach it.',true);return;}insertText(`\n![${file.name.replace(/[\[\]\n]/g,'')||'Image'}](${result.url})\n`);toast('Image added. Save the note to keep your changes.');}catch(e){toast(e.message||'Could not add image.',true);}}
// Escape all source text; only our own renderer can create HTML. Raw HTML is never executed.
function markdown(source){
 const blocks=[];const hold=html=>`\u0000${blocks.push(html)-1}\u0000`;
 let text=esc(source).replace(/```[^\n]*\n([\s\S]*?)```/g,(_,code)=>hold(`<pre><code>${code}</code></pre>`));
 text=text.replace(/`([^`\n]+)`/g,(_,code)=>hold(`<code>${code}</code>`));
 const safeUrl=(url,image=false)=>{const decoded=url.replace(/&amp;/g,'&');return image?/^(https:\/\/|\/uploads\/)[^\s<>]+$/i.test(decoded):/^(https?:\/\/|mailto:)[^\s<>]+$/i.test(decoded);};
 text=text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,(all,alt,url)=>safeUrl(url,true)?hold(`<img src="${url}" alt="${alt}" loading="lazy">`):all);
 text=text.replace(/\[\[([^\]]+)\]\]/g,(_,title)=>{const n=data.notes.find(n=>esc(n.title).toLowerCase()===title.toLowerCase());return hold(n?`<button class="wiki-link" data-action="open-note" data-id="${n.id}">${title}</button>`:`<span class="broken-link" title="No note with this title yet">${title}</span>`);});
 text=text.replace(/\[([^\]]+)\]\(([^)]+)\)/g,(all,label,url)=>safeUrl(url)?hold(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`):all);
 text=text.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*\n]+)\*/g,'<em>$1</em>').replace(/~~([^~\n]+)~~/g,'<del>$1</del>');
 let inList=false;let html=text.split('\n').map(line=>{const list=/^\s*[-*] (.+)$/.exec(line);if(list){const prefix=inList?'':'<ul>';inList=true;return prefix+'<li>'+list[1].replace(/^\[([ xX])\] /,(_,v)=>`<input type="checkbox" disabled ${v.trim()?'checked':''}> `)+'</li>';}const close=inList?'</ul>':'';inList=false;const heading=/^(#{1,6}) (.*)$/.exec(line);if(heading)return close+`<h${heading[1].length}>${heading[2]}</h${heading[1].length}>`;if(/^---+$/.test(line))return close+'<hr>';if(line.startsWith('&gt; '))return close+'<blockquote>'+line.slice(5)+'</blockquote>';return close+(line.trim()?'<div class="md-line">'+line+'</div>':'<div class="md-space"></div>');}).join('')+(inList?'</ul>':'');
 return html.replace(/\u0000(\d+)\u0000/g,(_,i)=>blocks[Number(i)]||'');
}
document.addEventListener('click',async event=>{
 const nav=event.target.closest('[data-nav]');if(nav){navigate(nav.dataset.nav);return;}
 const target=event.target.closest('[data-action]');if(!target)return;const a=target.dataset;
 switch(a.action){
 case 'refresh-rates':await updateRates(true);break;
 case 'close-modal':closeModal();break;
 case 'new-lesson-student':addStudentFromLesson();break;
 case 'new-student':studentForm();break;
 case 'edit-student':studentForm(a.id);break;
 case 'new-lesson':lessonForm(a);break;
 case 'edit-lesson':$('#dialog').close();lessonForm(a);break;
 case 'student-payment':studentPaymentForm(a.student);break;
 case 'new-pack':packForm(a.student);break;
 case 'lesson-detail':lessonDetail(a.id);break;
 case 'lesson-status':if(a.status==='cancelled'&&!confirm('Cancel this lesson? It won’t be charged and any applied account credit will be available again.'))return;try{await api('lesson-status',{id:Number(a.id),status:a.status});await refresh();$('#dialog').close();render();toast(a.status==='completed'?'Lesson completed. Nice work!':'Lesson updated');}catch(e){toast(e.message,true);}break;
 case 'student-profile':if(dirty&&!confirm('Leave this note without saving?'))return;dirty=false;noteDraft=null;route='students';selectedStudent=Number(a.id);render();break;
 case 'calendar-prev':case 'calendar-next':{const next=calendarPeriod(calendarDate,calendarMode,a.action==='calendar-next'?1:-1);if(calendarPeriodAllowed(next)){calendarDate=next;calendarScrollOffset=0;render();}break;}
 case 'calendar-today':calendarDate=new Date();calendarScrollOffset=0;render();break;
 case 'calendar-mode':calendarMode=a.mode;calendarScrollOffset=0;render();break;
 case 'account-tab':accountTab=a.tab;render();break;
 case 'pay':$('#dialog').close();paymentForm(a.kind,a.id);break;
 case 'undo-payment':if(confirm('Remove this payment record? The amount will become due again. This does not refund money.'))await mutate('delete-payment',{id:Number(a.id)},'Payment removed');break;
 case 'new-note':newNote(a.student);break;
 case 'open-note':openNote(a.id);break;
 case 'lesson-note':await openLessonNote(a.id);break;
 case 'save-note':await saveNote();break;
 case 'attach':$('#image-file').click();break;
 case 'format':{if(a.format==='bold')insertText('**','**','bold text');if(a.format==='italic')insertText('*','*','italic text');if(a.format==='heading')insertText('\n## ','','Heading');if(a.format==='link')insertText('[','](https://example.com)','link text');break;}
 case 'note-mode':$('#note-body').hidden=a.mode==='preview';$('#note-preview').hidden=a.mode!=='preview';$('.format-actions').hidden=a.mode==='preview';if(a.mode==='preview')$('#note-preview').innerHTML=markdown(noteDraft.body);document.querySelectorAll('[data-action="note-mode"]').forEach(b=>b.classList.toggle('selected',b===target));break;
 }
});
document.addEventListener('input',e=>{if(e.target.id==='search'){const pos=e.target.selectionStart;search=e.target.value;$('#page').innerHTML=page();if(route==='notes'&&selectedNote!==null)bindEditor();$('#search').focus();try{$('#search').setSelectionRange(pos,pos);}catch{}}});
document.addEventListener('change',e=>{if(e.target.id==='archived'){showArchived=e.target.checked;render();}});
document.addEventListener('submit',async e=>{if(e.target.id==='currency-form'){e.preventDefault();await mutate('settings',{currency:e.target.elements.currency.value},'Currency saved');}if(e.target.id==='time-format-form'){e.preventDefault();await mutate('settings',{time_format:e.target.elements.time_format.value},'Time format saved');}});
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='s'&&route==='notes'&&selectedNote!==null){e.preventDefault();saveNote();}});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
window.addEventListener('hashchange',()=>{if(location.hash==='#overview')navigate('overview');});
// Optional browser agent interface, using the same local records and accounting rules.
if(document.modelContext?.registerTool){
 const lifecycle=new AbortController();
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
 try{
  Promise.resolve(document.modelContext.registerTool({
   name:'get_tutoring_summary',title:'Read tutoring balances and credit',
   description:'Read local student balances, upcoming lessons, and student credit. Optionally filter by student ID. Does not change any records.',
   inputSchema:{type:'object',properties:{student_id:{type:'integer',minimum:1}},additionalProperties:false},
   annotations:{readOnlyHint:true,untrustedContentHint:true},
   async execute(input){
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>k!=='student_id')||('student_id' in input&&(!Number.isInteger(input.student_id)||input.student_id<1)))throw Error('Provide an optional positive integer student_id.');
    await refresh();
    if(input.student_id&&!student(input.student_id))throw Error('Student not found.');
    return {currency:data.settings.currency,conversion:'Latest available reference-rate estimates',rate_dates:data.fx?.dates||{},rate_error:data.fx?.error||'',students:data.students.filter(s=>!input.student_id||s.id===input.student_id).map(s=>({id:s.id,name:s.name,balance_due_cents:balance(s.id),billing_currency:currencyOf(s),original_balances:originalBalances(s.id),upcoming_lessons:data.lessons.filter(l=>l.student_id===s.id&&l.status==='scheduled').map(l=>({id:l.id,title:l.title,start:l.start,minutes:l.minutes})),packs:data.packs.filter(p=>p.student_id===s.id).map(p=>({id:p.id,name:p.name,amount:p.price,received:paid('pack',p.id),currency:currencyOf(p)}))}))};
   }
  },{signal:lifecycle.signal})).catch(()=>{});
 }catch{/* Ordinary browsers do not need this optional interface. */}
}
refresh().then(render).then(()=>updateRates()).catch(e=>{$('#app').innerHTML=`<div class="connection-error">${icon('local')}<h1>Let’s reconnect.</h1><p>${esc(e.message)} Make sure TutorTrack is running, then reload this page.</p><button class="btn primary" id="reload">Try again</button></div>`;$('#reload').onclick=()=>location.reload();});
