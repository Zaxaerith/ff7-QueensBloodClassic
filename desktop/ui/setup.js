// Narrow fixed bridge calls; no user-provided paths or code. GPL-3.0-only
const $=id=>document.getElementById(id);
let api, pending=false, lastDetail='';
async function call(name,...args){
  if(pending)return;
  pending=true;
  try{await api[name](...args);$('notice').textContent='';}
  catch(error){$('notice').textContent=String(error?.message??error);}
  finally{pending=false;await refresh();}
}
function row(left,right,bad=false){const div=document.createElement('div');div.className='row'+(bad?' bad':'');const a=document.createElement('span'),b=document.createElement('span');a.textContent=left;b.textContent=right;div.append(a,b);return div;}
async function refresh(){
  if(!api)return;
  try{
    const s=await api.status(),j=s.job,busy=['running','cancelling'].includes(j.status);
    $('source').textContent=s.source??'尚未选择。也可以跳过卡图，直接进入游戏。';
    $('pack').textContent=s.pack?`${s.pack.portraits}张已验证卡图 · ${s.pack.path}`:'没有加载卡包';
    $('previous').hidden=!s.previousPack||!!s.pack;
    for(const b of document.querySelectorAll('[data-job],#source-select'))b.disabled=busy||pending;
    $('inspect').disabled||=!s.source;$('plan').disabled||=!s.source;$('build').disabled||=!s.source;$('build-subset').disabled||=!s.source;
    $('play-art').disabled||=!s.pack;
    $('cancel').hidden=!busy;$('cancel').disabled=j.status==='cancelling';
    $('status').textContent=`${j.status} · ${j.message??'等待操作'}${j.requested?` · 成功 ${j.completed}/${j.requested}`:''}${j.seconds?` · ${j.seconds}s`:''}`;
    $('progress').max=j.requested||145;$('progress').value=j.completed;
    $('current').textContent=j.current?`#${String(j.current.cardId).padStart(3,'0')} ${j.current.name}`:'';
    const key=JSON.stringify([j.id,j.status,j.result]);
    if(key!==lastDetail){
      lastDetail=key;$('details').replaceChildren();
      const inspection=j.result?.inspection??(j.result?.archives?j.result:null);
      if(inspection)for(const a of inspection.archives)$('details').append(row(a.role,`${a.status}${a.reason?' · '+a.reason:''}`,!['validated','not-required'].includes(a.status)));
      if(j.kind==='plan'&&j.result?.cards){const ready=j.result.cards.filter(c=>c.status==='ready').length;$('details').append(row('生产计划',`${ready}/${j.result.cards.length} ready`));for(const c of j.result.cards.filter(c=>c.status!=='ready'))$('details').append(row(`#${c.cardId} ${c.name}`,JSON.stringify(c.problems),true));}
      for(const failure of j.failures??[])$('details').append(row(`#${String(failure.cardId).padStart(3,'0')} 生成失败`,failure.message??failure.code,true));
    }
    $('log').textContent=JSON.stringify({failures:j.failures,events:j.events,stderr:j.stderr},null,2);
    if(s.notice)$('notice').textContent=s.notice;
  }catch(error){$('notice').textContent=String(error?.message??error);}
}
window.addEventListener('pywebviewready',()=>{
  api=window.pywebview.api;
  for(const [id,method] of [['source-select','choose_source'],['inspect','inspect_source'],['plan','plan_source'],['pack-select','choose_pack'],['previous','check_previous_pack'],['cancel','cancel_generation']])$(id).addEventListener('click',()=>call(method));
  $('play-art').addEventListener('click',()=>call('enter_game',true));$('play-plain').addEventListener('click',()=>call('enter_game',false));
  $('build').addEventListener('click',()=>{if(confirm('将在新的私人目录生成145张卡图，可能需要约20分钟。开始？'))call('start_generation','all');});
  $('build-subset').addEventListener('click',()=>{const ids=$('cards').value.trim();if(confirm(`在新目录生成 ${ids}？`))call('start_generation',ids);});
  refresh();setInterval(refresh,750);
});
