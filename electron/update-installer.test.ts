import { expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildUpdateActivationScript, stageAppUpdate } from "./update-installer";

it("preserves the installed app when staging fails", async()=>{
 const root=await mkdtemp(join(tmpdir(),"app-update-"));const target=join(root,"app");
 try { await mkdir(target); await writeFile(join(target,"version"),"old");
  await expect(stageAppUpdate("source",target,{copy:async()=>{throw new Error("disk full");},verify:async()=>{}})).rejects.toThrow("disk full");
  expect(await readFile(join(target,"version"),"utf8")).toBe("old");
 } finally {await rm(root,{recursive:true,force:true});}
});
it("actual activation script leaves the old app untouched if the staged app is missing",async()=>{
 const root=await mkdtemp(join(tmpdir(),"app-script-"));const target=join(root,"app");
 try{await mkdir(target);await writeFile(join(target,"version"),"old");
  await expect(promisify(execFile)("/bin/zsh",["-c",buildUpdateActivationScript(),"test","999999",join(root,"missing"),target,join(root,"backup"),root,join(root,"temp"),join(root,"log")])).rejects.toThrow();
  expect(await readFile(join(target,"version"),"utf8")).toBe("old");
 }finally{await rm(root,{recursive:true,force:true});}
});
it.each([false,true])("actual activation script rolls back failed activation=%s and preserves backups",async fail=>{
 const root=await mkdtemp(join(tmpdir(),"update-activation-"));
 const target=join(root,"app"),staged=join(root,"staged"),backup=join(root,"backup"),bin=join(root,"bin");
 try{await Promise.all([target,staged,bin].map(path=>mkdir(path)));await writeFile(join(target,"version"),"old");await writeFile(join(staged,"version"),"new");
  for(const [name,body] of [["mv",'if [ "$1" = "$FAIL_FROM" ]; then exit 1; fi\nexec /bin/mv "$@"'],["open","exit 0"],["hdiutil","exit 0"]])await writeFile(join(bin,name),`#!/bin/sh\n${body}\n`,{mode:0o755});
  const run=promisify(execFile)("/bin/zsh",["-c",buildUpdateActivationScript(),"test","999999",staged,target,backup,"test-mount",join(root,"temp"),join(root,"log")],{env:{...process.env,PATH:`${bin}:/usr/bin:/bin`,FAIL_FROM:fail?staged:""}});
  if(fail){await expect(run).rejects.toThrow();expect(await readFile(join(target,"version"),"utf8")).toBe("old");}
  else{await run;expect(await readFile(join(target,"version"),"utf8")).toBe("new");expect(await readFile(join(backup,"version"),"utf8")).toBe("old");}
 }finally{await rm(root,{recursive:true,force:true});}
});
