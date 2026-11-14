import ManifoldModule from "manifold-3d/manifold";
import type { Mesh as NativeMesh } from "manifold-3d/manifold";
import type { Mesh, Triangle, Vec3 } from "./relief-export.js";
let modulePromise: ReturnType<typeof ManifoldModule> | undefined;
export async function getManifold() {
  modulePromise ??= ManifoldModule();
  const module = await modulePromise;
  module.setup();
  return module;
}

// Preserve Manifold's explicit seam welds instead of rounding coordinates or
// throwing away small faces, both of which can open a previously closed solid.
export function extractSolidMesh(output: NativeMesh): Mesh {
  const parents = Uint32Array.from({length:output.numVert},(_,i)=>i);
  for(let i=0;i<output.mergeFromVert.length;i++) parents[output.mergeFromVert[i]]=output.mergeToVert[i];
  const find=(v:number):number=>parents[v]===v?v:(parents[v]=find(parents[v]));
  const vertices:Vec3[]=[], triangles:Triangle[]=[];
  const indices=new Map<number,number>();
  for(let i=0;i<output.triVerts.length;i+=3) {
    const ids = [0,1,2].map(k=>{
      const source=find(output.triVerts[i+k]);
      let index=indices.get(source);
      if(index===undefined){index=vertices.length;indices.set(source,index);const offset=source*output.numProp;vertices.push([output.vertProperties[offset],output.vertProperties[offset+1],output.vertProperties[offset+2]]);}
      return index;
    });
    triangles.push(ids as [number,number,number]);
  }
  return {vertices,triangles};
}

export async function buildSvgSolid(parts: Array<{polygons:Array<Array<[number,number]>>;bottom:number;top:number;material:number}>): Promise<{mesh:Mesh;materials:number[]}> {
  const module=await getManifold();
  const resources:Array<{delete:()=>void}>=[];
  const track=<T extends {delete:()=>void}>(value:T):T=>{resources.push(value);return value;};
  const covered=new Map<string,InstanceType<typeof module.CrossSection>>();
  const solids:InstanceType<typeof module.Manifold>[]=[], materialIds=new Map<number,number>();
  try {
    // Later SVG fills own overlapping regions, including coplanar top faces.
    for(let i=parts.length-1;i>=0;i--){
      const part=parts[i],key=`${part.bottom}:${part.top}`;
      const section=track(new module.CrossSection(part.polygons,"EvenOdd"));
      const previous=covered.get(key);
      const visible=previous?track(section.subtract(previous)):section;
      covered.set(key,previous?track(previous.add(section)):section);
      if(visible.isEmpty())continue;
      const extruded=track(visible.extrude(part.top-part.bottom));
      const translated=track(extruded.translate([0,0,part.bottom]));
      const solid=track(translated.asOriginal());
      materialIds.set(solid.originalID(),part.material);
      solids.push(solid);
    }
    if(!solids.length)throw new Error("Die SVG enthält keine druckbaren Flächen.");
    const unified=track(module.Manifold.union(solids));
    const output=unified.getMesh();
    const materials=Array(output.triVerts.length/3).fill(0) as number[];
    for(let run=0;run<output.runOriginalID.length;run++){
      const start=output.runIndex[run]/3,end=(output.runIndex[run+1]??output.triVerts.length)/3;
      materials.fill(materialIds.get(output.runOriginalID[run])??0,start,end);
    }
    return {mesh:extractSolidMesh(output),materials};
  } finally {for(const resource of resources.reverse())resource.delete();}
}
