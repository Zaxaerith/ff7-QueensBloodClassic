import {t} from './i18n/index.js';
export const battleBackgrounds=[
  {id:'current',label:'originalBlue'},
  {id:'classic',label:'themeClassic'},
  {id:'hybrid',label:'themeHybrid'},
  {id:'dramatic',label:'themeDramatic'}
] as const;

export function mountBackgroundPicker(host:HTMLElement,select:HTMLSelectElement){
  function localize(){
    const value=select.value;
    select.replaceChildren(...battleBackgrounds.map(({id,label})=>new Option(t(label),id)));
    select.value=value||'hybrid';
  }
  localize();
  // No old persistent theme key existed. Historical choices remain temporary.
  select.value='hybrid';host.dataset.background='hybrid';
  select.addEventListener('change',()=>{
    if(battleBackgrounds.some(theme=>theme.id===select.value))host.dataset.background=select.value;
  });
  return localize;
}
