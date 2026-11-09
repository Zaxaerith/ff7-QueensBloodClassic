import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';

export async function withRuntime(run){
  const server=await createServer({configFile:fileURLToPath(new URL('../vite.config.ts',import.meta.url)),logLevel:'silent',server:{middlewareMode:true}});
  try {return await run(path=>server.ssrLoadModule(`/src/${path}.ts`));}
  finally {await server.close();}
}
