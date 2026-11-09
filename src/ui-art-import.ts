// Config-only local art controls; no Game or persistence API is imported.
// SPDX-License-Identifier: GPL-3.0-only
import {ArtImportClient,projectBrowserArt,type BrowserArtView,type VisualResolver} from './browser-art.js';
import {ART_LIMITS,type VerifiedBrowserArt,type SelectedArtFile} from './art-import.js';
import {getCardVisual} from './visuals.js';
import {element,button} from './ui-dom.js';

export function mountArtImport(host:HTMLElement,apply:(resolve:VisualResolver)=>void){
  const client=new ArtImportClient();let revision=0,active:BrowserArtView|null=null,pending:VerifiedBrowserArt|null=null,busy=false;
  const panel=element('section','art-import');panel.id='classicArt';
  const heading=element('h3','','CLASSIC ART / 卡图资源');
  const input=element('input');input.type='file';input.multiple=true;input.hidden=true;input.id='artFolder';
  const supported='webkitdirectory' in input;input.setAttribute('webkitdirectory','');input.setAttribute('aria-label','选择已生成的Art Pack文件夹');
  const status=element('p','art-import-status','未加载资源包');status.id='artImportStatus';status.setAttribute('role','status');
  const current=element('p','muted','当前使用默认字形占位');current.id='artImportCurrent';
  const progress=element('progress');progress.id='artImportProgress';progress.hidden=true;progress.max=1;progress.value=0;progress.setAttribute('aria-label','本地卡包文件校验进度');
  const choose=button('选择 / 更换卡包文件夹…',()=>input.click()),enable=button('启用已验证卡包',activate),cancel=button('取消验证',cancelImport),unload=button('卸载卡包',unloadImport);
  choose.id='artImportChoose';enable.id='artImportEnable';cancel.id='artImportCancel';unload.id='artImportUnload';
  const actions=element('div','button-row');actions.append(choose,enable,cancel,unload);
  const available=supported&&!!globalThis.crypto?.subtle&&typeof Worker==='function';
  choose.disabled=!available;
  const help=element('p','muted',available?'选择已经生成、含visual-manifest.json及build-report.json的Art Pack目录，不是FF7游戏安装目录。':'当前浏览器或来源不支持目录选择/安全校验；请使用新版Edge或Chrome和HTTPS/localhost。无图模式仍可正常游玩。');
  panel.append(heading,help,element('p','muted','仅在当前网页会话有效，刷新后需重新选择。文件只在本机校验和显示，不上传、不写入LocalStorage。'),current,status,progress,actions,input);
  const title=host.querySelector('.view-title');if(title)title.after(panel);else host.append(panel);
  function render(){enable.disabled=busy||!pending;cancel.hidden=!busy;unload.disabled=!active&&!pending&&!busy;progress.hidden=!busy;current.textContent=active?`已加载：${active.count}/145张编号卡图 · 当前会话有效`:'当前使用默认字形占位';}
  function cancelImport(){revision++;client.cancel();pending=null;busy=false;status.textContent=active?'验证已取消；保留当前卡包':'验证已取消；保留默认字形';render();}
  function activate(){
    if(!pending||busy)return;
    let next:BrowserArtView|undefined;
    try{next=projectBrowserArt(pending);apply(next.resolve);}
    catch(error){try{apply(active?.resolve??getCardVisual);}finally{next?.dispose();}status.textContent='启用失败：'+String(error);render();return;}
    const previous=active;active=next;pending=null;
    // apply() has synchronously replaced all old DOM image references. Active
    // URLs stay valid until the next swap/unload, never just until first load.
    previous?.dispose();status.textContent=`已加载：${active.count}/145张 · 仅当前会话`;render();
  }
  function unloadImport(){revision++;client.cancel();pending=null;busy=false;apply(getCardVisual);active?.dispose();active=null;status.textContent='未加载资源包 · 已恢复默认字形';render();}
  input.addEventListener('change',()=>{
    const ticket=++revision;client.cancel();pending=null;busy=false;
    const selected=input.files;
    if(!selected?.length){render();return;}
    if(selected.length>ART_LIMITS.files){input.value='';status.textContent='验证失败：文件超过4096；请选择Art Pack目录而非游戏安装目录';render();return;}
    const files:SelectedArtFile[]=Array.from(selected,file=>({relativePath:file.webkitRelativePath,file}));input.value='';
    busy=true;progress.value=0;status.textContent='正在验证本地文件…';render();
    void client.verify(files,p=>{if(revision!==ticket)return;progress.max=Math.max(p.total,1);progress.value=p.checked;status.textContent=`正在验证 ${p.checked}/${p.total} · ${p.path}`;}).then(result=>{
      if(revision!==ticket)return;busy=false;pending=result;status.textContent=result?`校验通过：${result.numberedPortraits}/145张 · ${result.name} · 点击启用`:'验证已取消；原资源保持不变';render();
    }).catch(error=>{if(revision!==ticket)return;busy=false;pending=null;status.textContent='验证失败：'+(error instanceof Error?error.message:String(error));render();});
  });
  window.addEventListener('pagehide',event=>{if(event.persisted)return;revision++;client.cancel();active?.dispose();pending=null;});
  render();
  return {cancel:cancelImport};
}
