import {t,type MessageKey,type MessageValue} from './i18n/index.js';
import {ArtImportClient,projectBrowserArt,type BrowserArtView,type VisualResolver} from './browser-art.js';
import {ART_LIMITS,type VerifiedBrowserArt,type SelectedArtFile} from './art-import.js';
import {getCardVisual} from './visuals.js';
import {element,button} from './ui-dom.js';

export function mountArtImport(host:HTMLElement,apply:(resolve:VisualResolver)=>void){
  const client=new ArtImportClient();let revision=0,active:BrowserArtView|null=null,pending:VerifiedBrowserArt|null=null,busy=false;
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
  const privacy=element('p','muted');panel.append(heading,help,privacy,current,status,progress,actions,input);
  const title=host.querySelector('.view-title');if(title)title.after(panel);else host.append(panel);
  let statusMessage: [MessageKey,...MessageValue[]]=['noArtPackLoaded'];
  function show(key:MessageKey,...values:MessageValue[]){statusMessage=[key,...values];status.textContent=t(key,...values);}
  function render(){enable.disabled=busy||!pending;cancel.hidden=!busy;unload.disabled=!active&&!pending&&!busy;progress.hidden=!busy;current.textContent=active?t("activeArtCount", active.count):t("usingDefaultSymbols");}
  function cancelImport(){revision++;client.cancel();pending=null;busy=false;show(active?'verificationCancelledTheCurrentArtPackIsStill':'verificationCancelledUsingDefaultSymbols');render();}
  function activate(){
    if(!pending||busy)return;
    let next:BrowserArtView|undefined;
    try{next=projectBrowserArt(pending);apply(next.resolve);}
    catch(error){try{apply(active?.resolve??getCardVisual);}finally{next?.dispose();}show('artError');render();return;}
    const previous=active;active=next;pending=null;
    // apply() has synchronously replaced all old DOM image references. Active
    // URLs stay valid until the next swap/unload, never just until first load.
    previous?.dispose();show('artLoaded',active.count);render();
  }
  function unloadImport(){revision++;client.cancel();pending=null;busy=false;apply(getCardVisual);active?.dispose();active=null;show('artPackUnloadedDefaultSymbolsRestored');render();}
  input.addEventListener('change',()=>{
    const ticket=++revision;client.cancel();pending=null;busy=false;
    const selected=input.files;
    if(!selected?.length){render();return;}
    if(selected.length>ART_LIMITS.files){input.value='';show('tooManyFilesMaximum4096SelectTheGenerated');render();return;}
    const files:SelectedArtFile[]=Array.from(selected,file=>({relativePath:file.webkitRelativePath,file}));input.value='';
    busy=true;progress.value=0;show('verifyingLocalFiles');render();
    void client.verify(files,p=>{if(revision!==ticket)return;progress.max=Math.max(p.total,1);progress.value=p.checked;show('artVerificationProgress',p.checked,p.total,p.path);}).then(result=>{
      if(revision!==ticket)return;busy=false;pending=result;if(result)show('artVerified',result.numberedPortraits,result.name);else show('verificationCancelledTheCurrentArtworkIsStillActive');render();
    }).catch(error=>{if(revision!==ticket)return;busy=false;pending=null;show('artError');render();});
  });
  window.addEventListener('pagehide',event=>{if(event.persisted)return;revision++;client.cancel();active?.dispose();pending=null;});
  render();
  return {cancel:cancelImport,localize(){
    heading.textContent=t('classicCardArtwork');input.setAttribute('aria-label',t('chooseAGeneratedArtPackFolder'));progress.setAttribute('aria-label',t('localArtPackValidationProgress'));
    choose.textContent=t('chooseOrReplaceArtPackFolder');enable.textContent=t('enableVerifiedArtPack');cancel.textContent=t('cancelVerification');unload.textContent=t('unloadArtPack');
    help.textContent=t(available?'chooseAGeneratedArtPackFolderContainingVisual':'directoryVerificationNeedsACurrentVersionOfEdge');privacy.textContent=t('theBrowserVerifiesAndDisplaysTheseFilesLocally');
    show(...statusMessage);render();
  }};
}
