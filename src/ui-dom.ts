export const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
export function element<K extends keyof HTMLElementTagNameMap>(tag:K,className='',text=''):HTMLElementTagNameMap[K]{
  const node=document.createElement(tag);node.className=className;if(text)node.textContent=text;return node;
}
export function button(text:string,action:()=>void,className=''):HTMLButtonElement {
  const node=element('button',className,text);node.type='button';node.onclick=action;return node;
}
export function options(select:HTMLSelectElement,rows:readonly (readonly [string,string])[]){
  select.replaceChildren(...rows.map(([value,label])=>{const node=element('option','',label);node.value=value;return node;}));
}
let dialogReturn:HTMLElement|null=null;
export function openDialog(title:string,content:HTMLElement){
  const dialog=$<HTMLDialogElement>('infoDialog');
  if(!dialog.open)dialogReturn=document.activeElement as HTMLElement|null;
  $('dialogTitle').textContent=title;$('dialogContent').replaceChildren(content);
  if(!dialog.open)dialog.showModal();$('dialogClose').focus();
}
export function closeDialog(){const dialog=$<HTMLDialogElement>('infoDialog');dialog.close();if(dialogReturn?.isConnected)dialogReturn.focus();}
export function initDialog(){
  const dialog=$<HTMLDialogElement>('infoDialog');$('dialogClose').onclick=closeDialog;
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
}
export function notice(text:string){$('appNotice').textContent=text;}
export function downloadJson(value:unknown,name:string){
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),link=element('a');
  link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function restoreFocus(key:string|undefined){if(key)document.querySelector<HTMLElement>(`[data-focus="${key}"]`)?.focus({preventScroll:true});}
