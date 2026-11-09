import {readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {withRuntime} from './runtime.mjs';

const fail=error=>({ok:false,error:{code:'INVALID_REQUEST',message:error instanceof Error?error.message:String(error)}});
try {
  await withRuntime(async load=>{
    const {QbSession}=await load('session'),session=new QbSession();
    const execute=text=>{
      let result;try{result=session.execute(JSON.parse(text));}catch(error){result=fail(error);}
      process.stdout.write(JSON.stringify(result)+'\n');
      if(!result.ok)process.exitCode=1;
    };
    if(process.argv[2]==='--jsonl'){
      for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})) if(line.trim())execute(line);
    } else {
      let input;
      if(process.argv[2])input=await readFile(process.argv[2],'utf8');
      else {const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);input=Buffer.concat(chunks).toString('utf8');}
      execute(input);
    }
  });
} catch(error){process.stdout.write(JSON.stringify(fail(error))+'\n');process.exitCode=1;}
