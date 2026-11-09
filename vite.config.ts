import {defineConfig} from 'vitest/config';
import {fileURLToPath} from 'node:url';
import {readPrivatePack} from './tools/private-pack.mjs';

export default defineConfig(({mode})=>{
const privateMode=mode==='private';
// External paths are read-only and reached only through an explicit private mode.
const privateFiles=privateMode?readPrivatePack(fileURLToPath(new URL('.',import.meta.url)),process.env.QB_PRIVATE_ASSETS??'private-assets/card-art',{allowExternal:true}):new Map<string,Buffer>();
return {
  root: 'site',
  base: './',
  publicDir: false,
  resolve: {alias: {'/src': fileURLToPath(new URL('./src',import.meta.url))}},
  server: {host:'127.0.0.1',port:5173,strictPort:true},
  build: {outDir:privateMode?'../dist-private':'../dist',emptyOutDir:true},
  preview: {host:'127.0.0.1',port:5173,strictPort:true},
  plugins: [{name:'catalog',generateBundle(){
    // Keep the catalog in the standalone production artifact as well as dev.
    this.emitFile({type:'asset',fileName:'catalog.json',source:catalog});
    for(const [fileName,source] of privateFiles)this.emitFile({type:'asset',fileName,source});
  },configureServer(server){
    if(!privateMode)return;
    server.middlewares.use((request,response,next)=>{
      const path=(request.url??'').split('?')[0].replace(/^\//,'');const data=privateFiles.get(path);
      if(!data){next();return;}response.setHeader('Content-Type',path.endsWith('.png')?'image/png':'application/json');response.end(data);
    });
  }}],
  test: {root:fileURLToPath(new URL('.',import.meta.url)),include:['tests/**/*.test.ts'],environment:'node'}
};});
import {readFileSync} from 'node:fs';
const catalog=readFileSync(new URL('./data/card-catalog.json',import.meta.url),'utf8');
