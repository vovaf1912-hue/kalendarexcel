'use strict';
let boxAllocations=[];let boxChannel=null;let boxScreen=false;let boxError='';
const boxDayIn=(d,a)=>a.start_date<=d&&a.end_date>=d;
const boxJob=a=>state.events.find(e=>e.id===a.appointment_id);
async function loadBoxes(){
 if(!configured||!state.session)return;
 const {data,error}=await sb.from('box_allocations').select('*').order('start_date',{ascending:true}).limit(3000);
 if(error){boxError='Боксы: '+error.message;console.warn(boxError);return}
 boxError='';boxAllocations=data||[];
 if(boxScreen)renderBoxes();if(document.getElementById('calendar'))renderBoxCalendar();
 if(!boxChannel){boxChannel=sb.channel('garage-boxes-v1').on('postgres_changes',{event:'*',schema:'public',table:'box_allocations'},()=>loadBoxes()).subscribe()}
}
function toggleBoxes(){boxScreen=!boxScreen;const root=document.getElementById('boxesRoot');if(root)root.hidden=!boxScreen;if(boxScreen)renderBoxes()}
function renderBoxes(){
 const root=document.getElementById('boxesRoot');if(!root)return;
 let start=startWeek(state.date),days=Array.from({length:7},(_,i)=>plusDays(start,i));
 const boxCell=(box,d)=>{
  const entries=boxAllocations.filter(a=>a.box_no===box&&boxDayIn(d,a)).filter(a=>boxJob(a));
  return `<div class="box-cell">${entries.length?entries.map(a=>{const e=boxJob(a);return `<div class="box-job" style="border-left:3px solid ${/^#[0-9a-f]{6}$/i.test(e.color)?e.color:'#4b8cff'}" title="${esc(e.work||'')}"><b>${esc(e.car)}</b><small>${esc(getMaster(e.master_id))}</small></div>`}).join(''):'<span class="small">Свободно</span>'}${entries.length>1?'<div class="box-warn">⚠ Пересечение</div>':''}</div>`;
 };
 root.innerHTML=`<div class="box-head"><div><h2>Боксы</h2><p class="small">Занятость по дням · перемещения не меняют график мастеров</p></div>${state.role==='owner'?'<button class="btn primary" onclick="openBoxForm()">+ Разместить / переместить</button>':''}</div>${boxError?`<div class="alert">${esc(boxError)}. Выполните boxes.sql в Supabase.</div>`:''}<div class="box-scroll"><div class="box-grid"><div class="box-label">Бокс</div>${days.map(d=>`<div class="box-date">${esc(fmtDate(d))}</div>`).join('')}${[1,2].map(b=>`<div class="box-label"><b>Бокс ${b}</b></div>${days.map(d=>boxCell(b,d)).join('')}`).join('')}</div></div><div class="box-history"><h3>Размещения автомобилей</h3>${boxAllocations.filter(a=>boxJob(a)).slice().sort((a,b)=>b.start_date.localeCompare(a.start_date)).slice(0,40).map(a=>`<div class="box-history-row"><span><b>${esc(boxJob(a).car)}</b> · Бокс ${a.box_no}<small>${esc(a.start_date)} — ${esc(a.end_date)} · ${esc(getMaster(boxJob(a).master_id))}</small></span>${state.role==='owner'?`<div class="actions"><button class="btn" onclick="openMoveForm('${a.id}')">Переместить</button><button class="btn" onclick="openBoxForm('${a.id}')">Изменить</button></div>`:''}</div>`).join('')||'<div class="small">Пока нет размещений. Нажмите «Разместить / переместить».</div>'}</div>`;
}
function openBoxForm(id=''){
 if(state.role!=='owner')return toast('Только владелец может менять боксы');
 const a=boxAllocations.find(x=>x.id===id);const options=state.events.filter(e=>e.status!=='cancelled').map(e=>`<option value="${esc(e.id)}" ${a?.appointment_id===e.id?'selected':''}>${esc(e.car)} · ${esc(getMaster(e.master_id))} · ${esc(e.start_at.slice(0,10))}</option>`).join('');
 if(!options)return toast('Сначала создайте запись автомобиля');
 $('modalRoot').innerHTML=`<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal"><h2>${a?'Изменить размещение':'Переместить автомобиль в другой бокс'}</h2><form id="boxForm"><div class="formgrid"><label class="span2">Автомобиль<select name="appointment_id" required>${options}</select></label><label>Бокс<select name="box_no"><option value="1" ${a?.box_no===1?'selected':''}>Бокс 1</option><option value="2" ${a?.box_no===2?'selected':''}>Бокс 2</option></select></label><label>С даты<input name="start_date" type="date" required value="${esc(a?.start_date||state.date)}"></label><label>По дату (включительно)<input name="end_date" type="date" required value="${esc(a?.end_date||state.date)}"></label></div><div class="small">Для переезда: закончите период в первом боксе накануне и добавьте период во втором. Записи мастеров не перемещаются.</div><div id="boxFormError" class="alert"></div><div class="footer-actions">${a?`<button type="button" class="btn danger" onclick="deleteBox('${a.id}')">Удалить</button>`:''}<button type="button" class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" type="submit">Сохранить</button></div></form></div></div>`;
 $('boxForm').onsubmit=e=>saveBox(e,id);
}
async function saveBox(ev,id){
 ev.preventDefault();const p=Object.fromEntries(new FormData(ev.target).entries());p.box_no=Number(p.box_no);
 const err=$('boxFormError');if(p.end_date<p.start_date){err.textContent='Дата окончания раньше начала';return}
 const job=state.events.find(e=>e.id===p.appointment_id);if(!job){err.textContent='Автомобиль не найден';return}
 if(p.start_date<job.start_at.slice(0,10)||p.end_date>job.service_end){err.textContent='Период бокса должен быть внутри срока нахождения автомобиля в сервисе';return}
 const overlaps=boxAllocations.filter(a=>a.id!==id&&a.box_no===p.box_no&&a.start_date<=p.end_date&&p.start_date<=a.end_date);
 if(overlaps.length&&!confirm(`В боксе ${p.box_no} уже есть ${overlaps.length} размещений на эти даты. Сохранить с пересечением?`))return;
 const other=boxAllocations.filter(a=>a.id!==id&&a.appointment_id===p.appointment_id&&a.start_date<=p.end_date&&p.start_date<=a.end_date);
 if(other.length&&!confirm('Этот автомобиль уже размещён в боксе на часть выбранных дат. Сохранить?'))return;
 const btn=ev.target.querySelector('[type=submit]');btn.disabled=true;
 try{if(configured){const q=id?sb.from('box_allocations').update(p).eq('id',id):sb.from('box_allocations').insert(p);const {error}=await q;if(error)throw error;}else{if(id)boxAllocations=boxAllocations.map(a=>a.id===id?{...a,...p}:a);else boxAllocations.push({...p,id:uid()})}
 closeModal();await loadBoxes();renderBoxes();toast('Размещение сохранено');}
 catch(e){err.textContent=e.message||'Ошибка сохранения';btn.disabled=false}
}
async function deleteBox(id){if(state.role!=='owner')return;if(!confirm('Удалить размещение?'))return;try{if(configured){const {error}=await sb.from('box_allocations').delete().eq('id',id);if(error)throw error;}else boxAllocations=boxAllocations.filter(a=>a.id!==id);closeModal();await loadBoxes();renderBoxes();toast('Размещение удалено')}catch(e){toast('Ошибка: '+e.message)}}
window.addEventListener('focus',()=>{if(boxScreen&&configured&&state.session)loadBoxes()});

// Box-first planning: the bay is the primary calendar resource.
const BOX_MASTERS={1:['anna','vitya'],2:['danya','vitya']};
function allowedInBox(box,master){return (BOX_MASTERS[box]||[]).includes(master)}
function filterBoxMasters(form,preferred){
 const select=form.elements.master_id,box=Number(form.elements.box_no.value);
 const current=preferred||select.value;
 for(const option of select.options)option.hidden=option.disabled=!allowedInBox(box,option.value);
 if(!allowedInBox(box,current))select.value=BOX_MASTERS[box][0];else select.value=current;
}
function boxItems(box,day){return boxAllocations.filter(a=>a.box_no===box&&boxDayIn(day,a)).map(a=>({a,e:boxJob(a)})).filter(x=>x.e&&x.e.status!=='cancelled'&&(!state.search||[x.e.car,x.e.client,x.e.work,x.e.note].some(t=>String(t||'').toLowerCase().includes(state.search.toLowerCase()))));}
// Main calendar: one row for Box 1, separate Dania/Vitya rows for Box 2.
// Records remain tied to their existing appointment and box allocation.
function boxCellHTML(box,day,master=null){
 const items=boxItems(box,day).filter(({e})=>!master||e.master_id===master);
 const add=state.role==='owner'?`<button class="btn" style="padding:4px 8px" onclick="openBoxEditor(${box},'${day}','${master||''}')">+ Авто</button>`:'';
 return `<div class="day-cell ${day===today?'today':''}">${items.map(({e})=>jobHTML(e,day)).join('')||'<div class="empty">Свободно</div>'}${items.length>1?'<div class="box-warn">⚠ Пересечение записей</div>':''}${add}</div>`;
}
function openBoxEditor(box,day,master=''){
 const chosen=master||(box===2?'danya':'anna');
 openEditor(null,day,chosen);
 const f=document.getElementById('eventForm');
 if(f){f.elements.box_no.value=String(box);filterBoxMasters(f,chosen)}
}
function renderBoxCalendar(){
 const root=document.getElementById('calendar');if(!root)return;
 const first=state.view==='week'?startWeek(state.date):state.date;
 let days;
 if(state.view==='month'){
  const d=dateFrom(state.date);
  days=Array.from({length:new Date(d.getFullYear(),d.getMonth()+1,0).getDate()},(_,i)=>localDate(new Date(d.getFullYear(),d.getMonth(),i+1)));
 }else days=Array.from({length:state.view==='week'?7:1},(_,i)=>plusDays(first,i));
 const n=days.length;
 const style=`grid-template-columns:130px repeat(${n},minmax(${n>7?105:145}px,1fr));min-width:${130+n*(n>7?105:145)}px`;
 const rows=[
  {box:1,master:null,label:'Бокс 1',sub:'Анна, Витя'},
  {box:2,master:'danya',label:'Бокс 2',sub:'Даня'},
  {box:2,master:'vitya',label:'Бокс 2',sub:'Витя'}
 ];
 root.innerHTML=`<div class="calendar"><div class="grid-head" style="${style}"><div>Бокс / мастер</div>${days.map(d=>`<div>${esc(fmtDate(d))}</div>`).join('')}</div>${rows.map(r=>`<div class="master-row" style="${style}"><div class="master-title"><strong>${r.label}</strong><span class="small">${r.sub}</span></div>${days.map(d=>boxCellHTML(r.box,d,r.master)).join('')}</div>`).join('')}</div>`;
}
async function saveInitialBox(job,box,existingId){
 if(!configured)return;
 const start=job.start_at.slice(0,10),end=job.service_end;
 const rows=boxAllocations.filter(a=>a.appointment_id===job.id).sort((a,b)=>a.start_date.localeCompare(b.start_date));
 if(existingId&&rows.length){
  // Do not overwrite movement history on an edit. Only update the single unchanged placement.
  if(rows.length===1){const row=rows[0];const {error}=await sb.from('box_allocations').update({box_no:box,start_date:start,end_date:end}).eq('id',row.id);if(error)throw error;}
 }else{
  const {error}=await sb.from('box_allocations').insert({appointment_id:job.id,box_no:box,start_date:start,end_date:end});if(error)throw error;
 }
 await loadBoxes();
}

function openMoveForm(id){
 if(state.role!=='owner')return;
 const a=boxAllocations.find(x=>x.id===id),job=a&&boxJob(a);if(!a||!job)return;
 const next=a.box_no===1?2:1;
 $('modalRoot').innerHTML=`<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal"><h2>Переместить ${esc(job.car)}</h2><p class="small">Бокс ${a.box_no} → Бокс ${next}. История ремонта и мастер сохраняются.</p><form id="moveForm"><div class="formgrid"><label>Дата переезда<input type="date" name="date" min="${esc(a.start_date)}" max="${esc(job.service_end)}" value="${esc(plusDays(a.start_date,1)<=job.service_end?plusDays(a.start_date,1):a.start_date)}" required></label><label>В новый бокс<select name="box_no"><option value="${next}">Бокс ${next}</option><option value="${a.box_no}">Бокс ${a.box_no}</option></select></label></div><div id="moveError" class="alert"></div><div class="footer-actions"><button class="btn" type="button" onclick="closeModal()">Отмена</button><button class="btn primary">Переместить</button></div></form></div></div>`;
 $('moveForm').onsubmit=async ev=>{ev.preventDefault();const f=new FormData(ev.target),date=f.get('date'),box=Number(f.get('box_no')),err=$('moveError');if(date<a.start_date||date>job.service_end||box===a.box_no){err.textContent='Проверьте дату и новый бокс';return}const last=plusDays(date,-1);const conflicts=boxAllocations.filter(x=>x.id!==id&&x.box_no===box&&x.start_date<=job.service_end&&date<=x.end_date);if(conflicts.length&&!confirm('В новом боксе есть пересечение. Продолжить?'))return;
 try{if(date>a.start_date){const {error}=await sb.from('box_allocations').update({end_date:last}).eq('id',id);if(error)throw error;}else{const {error}=await sb.from('box_allocations').delete().eq('id',id);if(error)throw error;}
 const {error}=await sb.from('box_allocations').insert({appointment_id:job.id,box_no:box,start_date:date,end_date:job.service_end});if(error)throw error;closeModal();await loadBoxes();render();toast('Автомобиль перемещён');}catch(e){err.textContent='Не удалось завершить перемещение: '+e.message+'; проверьте размещения в истории';}};
}
