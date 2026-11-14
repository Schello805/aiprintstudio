import {expect,it} from "vitest";
import {createPaletteLoader} from "./palette-loader";
it("does not overwrite a restored palette when an old import finishes",async()=>{
 let finish!:(value:string[])=>void;
 const loader=createPaletteLoader(()=>new Promise(resolve=>{finish=resolve;}));
 let colors=["#123456"];
 const pending=loader.load("import",palette=>{colors=palette;});
 loader.cancel();colors=["#FFFFFF","#000000"];
 finish(["#FF0000"]);await pending;expect(colors).toEqual(["#FFFFFF","#000000"]);
});
it("applies detection to a new source only",async()=>{
 const loader=createPaletteLoader(async()=>["#FF0000"]);let colors:string[]=[];
 await loader.load("new source",palette=>{colors=palette;});expect(colors).toEqual(["#FF0000"]);
});
