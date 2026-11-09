import type {VisualManifest} from '../shared/visual-manifest.mjs';
export interface PrivatePackOptions {readonly allowExternal?:boolean;}
export function inspectPrivatePack(root:string,pack:string,options?:PrivatePackOptions):{directory:string;manifest:VisualManifest;files:Map<string,Buffer>};
export function readPrivatePack(root:string,pack:string,options?:PrivatePackOptions):Map<string,Buffer>;
