import {t,type MessageKey,type MessageValue} from './i18n/index.js';
import {ArtImportClient,clearCachedArtPack,loadCachedArtPack,projectBrowserArt,saveCachedArtPack,type BrowserArtView,type VisualResolver} from './browser-art.js';
import {ART_LIMITS,type VerifiedBrowserArt,type SelectedArtFile} from './art-import.js';
import {getCardVisual} from './visuals.js';
import {element,button} from './ui-dom.js';

export interface ArtPackCache {
  load:()=>Promise<VerifiedBrowserArt|null>;
  save:(pack:VerifiedBrowserArt)=>Promise<boolean>;
  clear:()=>Promise<boolean>;
}
const defaultArtCache:ArtPackCache={
  load:()=>loadCachedArtPack(),
  save:pack=>saveCachedArtPack(pack),
  clear:()=>clearCachedArtPack(),
};

export function mountArtImport(host:HTMLElement,apply:(resolve:VisualResolver)=>void,cache:ArtPackCache=defaultArtCache){
  const client=new ArtImportClient();let revision=0,active:BrowserArtView|null=null,pending:VerifiedBrowserArt|null=null,busy=false;
  let activeSource:'none'|'session'|'cached'='none';
  const panel=element('section','art-import');panel.id='classicArt';
  const heading=element('h3','',t("classicCardArtwork"));
  const input=element('input');input.type='file';input.multiple=true;input.hidden=true;input.id='artFolder';
  const supported='webkitdirectory' in input;input.setAttribute('webkitdirectory','');input.setAttribute('aria-label',t("chooseAGeneratedArtPackFolder"));
  const status=element('p','art-import-status',t("noArtPackLoaded"));status.id='artImportStatus';status.setAttribute('role','status');
  const current=element('p','muted',t("usingDefaultSymbols"));current.id='artImportCurrent';
  const progress=element('progress');progress.id='artImportProgress';progress.hidden=true;progress.max=1;progress.value=0;progress.setAttribute('aria-label',t("localArtPackValidationProgress"));
  const choose=button(t("chooseOrReplaceArtPackFolder"),()=>input.click()),enable=button(t("enableVerifiedArtPack"),activate),cancel=button(t("cancelVerification"),cancelImport),unload=button(t("unloadArtPack"),unloadImport);
  choose.id='artImportChoose';enable.id='artImportEnable';cancel.id='artImportCancel';unload.id='artImportUnload';
  const actions=element('div','button-row');actions.append(choose,enable,cancel,unload);
  const available=supported&&!!globalThis.crypto?.subtle&&typeof Worker==='function';
  choose.disabled=!available;
  const help=element('p','muted',available?t("chooseAGeneratedArtPackFolderContainingVisual"):t("directoryVerificationNeedsACurrentVersionOfEdge"));
  const cacheAvailable=(()=>{try{return typeof (globalThis as {indexedDB?:IDBFactory}).indexedDB?.open==='function';}catch{return false;}})();
  const privacy=element('p','muted',t(cacheAvailable?'artImportLocalCacheNote':'theBrowserVerifiesAndDisplaysTheseFilesLocally'));panel.append(heading,help,privacy,current,status,progress,actions,input);
  const title=host.querySelector('.view-title');if(title)title.after(panel);else host.append(panel);
  let statusMessage: [MessageKey,...MessageValue[]]=['noArtPackLoaded'];
  function show(key:MessageKey,...values:MessageValue[]){statusMessage=[key,...values];status.textContent=t(key,...values);}
  function render(){enable.disabled=busy||!pending;cancel.hidden=!busy;unload.disabled=!active&&!pending&&!busy;progress.hidden=!busy;current.textContent=active?t(activeSource==='cached'?'activeArtCountCached':'activeArtCount', active.count):t("usingDefaultSymbols");}
  function cancelImport(){revision++;client.cancel();pending=null;busy=false;show(active?'verificationCancelledTheCurrentArtPackIsStill':'verificationCancelledUsingDefaultSymbols');render();}
  function activate(){
    if(!pending||busy)return;
    const pack=pending,ticket=++revision;
    let next:BrowserArtView|undefined;
    try{next=projectBrowserArt(pack);apply(next.resolve);}
    catch{try{apply(active?.resolve??getCardVisual);}finally{next?.dispose();}show('artError');render();return;}
    const previous=active;active=next;activeSource='session';pending=null;
    // apply() has synchronously replaced all old DOM image references. Active
    // URLs stay valid until the next swap/unload, never just until first load.
    previous?.dispose();show('artLoaded',active.count);render();
    void cache.save(pack).then(saved=>{
      if(revision!==ticket||!active||!saved)return;
      activeSource='cached';
      show('artLoadedCached',active.count,pack.name);
      render();
    }).catch(()=>{});
  }
  function unloadImport(){
    revision++;client.cancel();pending=null;busy=false;
    apply(getCardVisual);active?.dispose();active=null;activeSource='none';
    show('artPackUnloadedDefaultSymbolsRestored');render();
    void cache.clear().catch(()=>{});
  }
  input.addEventListener('change',()=>{
    const ticket=++revision;client.cancel();pending=null;busy=false;
    const selected=input.files;
    if(!selected?.length){render();return;}
    if(selected.length>ART_LIMITS.files){input.value='';show('tooManyFilesMaximum4096SelectTheGenerated');render();return;}
    const files:SelectedArtFile[]=Array.from(selected,file=>({relativePath:file.webkitRelativePath,file}));input.value='';
    busy=true;progress.value=0;show('verifyingLocalFiles');render();
    void client.verify(files,p=>{if(revision!==ticket)return;progress.max=Math.max(p.total,1);progress.value=p.checked;show('artVerificationProgress',p.checked,p.total,p.path);}).then(result=>{
      if(revision!==ticket)return;busy=false;pending=result;if(result)show('artVerified',result.numberedPortraits,result.name);else show('verificationCancelledTheCurrentArtworkIsStillActive');render();
    }).catch(()=>{if(revision!==ticket)return;busy=false;pending=null;show('artError');render();});
  });
  window.addEventListener('pagehide',event=>{if(event.persisted)return;revision++;client.cancel();active?.dispose();pending=null;});
  const restoreTicket=revision;
  void cache.load().then(cached=>{
    if(revision!==restoreTicket||!cached)return;
    let next:BrowserArtView|undefined;
    try{next=projectBrowserArt(cached);apply(next.resolve);}
    catch{
      try{apply(active?.resolve??getCardVisual);}finally{next?.dispose();}
      void cache.clear().catch(()=>{});
      return;
    }
    const previous=active;active=next;activeSource='cached';
    previous?.dispose();show('artRestoredFromCache',active.count,cached.name);render();
  }).catch(()=>{});
  render();
  return {cancel:cancelImport,localize(){
    heading.textContent=t('classicCardArtwork');input.setAttribute('aria-label',t('chooseAGeneratedArtPackFolder'));progress.setAttribute('aria-label',t('localArtPackValidationProgress'));
    choose.textContent=t('chooseOrReplaceArtPackFolder');enable.textContent=t('enableVerifiedArtPack');cancel.textContent=t('cancelVerification');unload.textContent=t('unloadArtPack');
    help.textContent=t(available?'chooseAGeneratedArtPackFolderContainingVisual':'directoryVerificationNeedsACurrentVersionOfEdge');
    privacy.textContent=t(cacheAvailable?'artImportLocalCacheNote':'theBrowserVerifiesAndDisplaysTheseFilesLocally');
    show(...statusMessage);render();
  }};
}
