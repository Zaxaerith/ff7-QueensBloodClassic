/** Approved default, with advanced historical comparisons. No rule dependency. */
export const battleBackgrounds=[
  {id:'current',label:'Current · 原有纯蓝'},
  {id:'classic',label:'A · Triple Triad Classic'},
  {id:'hybrid',label:'B · Classic Hybrid — Refined'},
  {id:'dramatic',label:"C · Queen’s Blood Dramatic"}
] as const;

export function mountBackgroundPicker(host:HTMLElement,select:HTMLSelectElement){
  select.replaceChildren(...battleBackgrounds.map(({id,label})=>new Option(label,id)));
  // No old persistent theme key existed. Historical choices remain temporary.
  select.value='hybrid';host.dataset.background='hybrid';
  select.addEventListener('change',()=>{
    if(battleBackgrounds.some(theme=>theme.id===select.value))host.dataset.background=select.value;
  });
}
