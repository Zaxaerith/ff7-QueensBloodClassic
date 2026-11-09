// Separate from Bot/Analysis Workers; no rules, networking or persistent state.
import {verifyBrowserArt,type SelectedArtFile} from './art-import.js';
const worker=globalThis as unknown as {onmessage:((e:MessageEvent<{files:SelectedArtFile[]}>)=>void)|null;postMessage:(v:unknown)=>void};
worker.onmessage=event=>{void verifyBrowserArt(event.data.files,p=>worker.postMessage({type:'progress',progress:p})).then(pack=>worker.postMessage({type:'verified',pack})).catch(error=>worker.postMessage({type:'error',message:error instanceof Error?error.message:String(error)}));};
