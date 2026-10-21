'use strict';
let boxAllocations=[];let boxChannel=null;let boxScreen=false;let boxError='';
const boxDayIn=(d,a)=>a.start_date<=d&&a.end_date>=d;
const boxJob=a=>state.events.find(e=>e.id===a.appointment_id);
async function loadBoxes(){
 if(!configured||!state.session)return;
 const {data,error}=await sb.from('box_allocations').select('*').order('start_date',{ascending:true}).limit(3000);
 if(error){boxError='Боксы: '+error.message;console.warn(boxError);return}
 boxError='';boxAllocations=data||[];
 if(boxScreen)renderBoxes();
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
 root.innerHTML=`<div class="box-head"><div><h2>Боксы</h2><p class="small">Занятость по дням · перемещения не меняют график мастеров</p></div>${state.role==='owner'?'<button class="btn primary" onclick="openBoxForm()">+ Разместить / переместить</button>':''}</div>${boxError?`<div class="alert">${esc(boxError)}. Выполните boxes.sql в Supabase.</div>`:''}<div class="box-scroll"><div class="box-grid"><div class="box-label">Бокс</div>${days.map(d=>`<div class="box-date">${esc(fmtDate(d))}</div>`).join('')}${[1,2].map(b=>`<div class="box-label"><b>Бокс ${b}</b></div>${days.map(d=>boxCell(b,d)).join('')}`).join('')}</div></div><div class="box-history"><h3>Размещения автомобилей</h3>${boxAllocations.filter(a=>boxJob(a)).slice().sort((a,b)=>b.start_date.localeCompare(a.start_date)).slice(0,40).map(a=>`<div class="box-history-row"><span><b>${esc(boxJob(a).car)}</b> · Бокс ${a.box_no}<small>${esc(a.start_date)} — ${esc(a.end_date)} · ${esc(getMaster(boxJob(a).master_id))}</small></span>${state.role==='owner'?`<button class="btn" onclick="openBoxForm('${a.id}')">Изменить</button>`:''}</div>`).join('')||'<div class="small">Пока нет размещений. Нажмите «Разместить / переместить».</div>'}</div>`;
}
function openBoxForm(id=''){
 if(state.role!=='owner')return toast('Только владелец может менять боксы');
 const a=boxAllocations.find(x=>x.id===id);const options=state.events.filter(e=>e.status!=='cancelled').map(e=>`<option value="${esc(e.id)}" ${a?.appointment_id===e.id?'selected':''}>${esc(e.car)} · ${esc(getMaster(e.master_id))} · ${esc(e.start_at.slice(0,10))}</option>`).join('');
 if(!options)return toast('Сначала создайте запись автомобиля');
 $('modalRoot').innerHTML=`<div class="modal-bg" onclick="if(event.target===this)closeModal()"><div class="modal"><h2>${a?'Изменить размещение':'Разместить автомобиль в боксе'}</h2><form id="boxForm"><div class="formgrid"><label class="span2">Автомобиль<select name="appointment_id" required>${options}</select></label><label>Бокс<select name="box_no"><option value="1" ${a?.box_no===1?'selected':''}>Бокс 1</option><option value="2" ${a?.box_no===2?'selected':''}>Бокс 2</option></select></label><label>С даты<input name="start_date" type="date" required value="${esc(a?.start_date||state.date)}"></label><label>По дату (включительно)<input name="end_date" type="date" required value="${esc(a?.end_date||state.date)}"></label></div><div class="small">Для переезда: закончите период в первом боксе накануне и добавьте период во втором. Записи мастеров не перемещаются.</div><div id="boxFormError" class="alert"></div><div class="footer-actions">${a?`<button type="button" class="btn danger" onclick="deleteBox('${a.id}')">Удалить</button>`:''}<button type="button" class="btn" onclick="closeModal()">Отмена</button><button class="btn primary" type="submit">Сохранить</button></div></form></div></div>`;
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
