export interface LocalPaths {version:1;sources:Record<string,string>;artPacks:Record<string,string>;}
export function readLocalPaths(root:string,explicit?:string,env?:NodeJS.ProcessEnv):LocalPaths;
export function selectArtPack(root:string,pack:string,paths:LocalPaths):string;
