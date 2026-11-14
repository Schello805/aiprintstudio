import { DOMParser, type Element as XmlElement } from "@xmldom/xmldom";
import JSZip from "jszip";
import { posix } from "node:path";
import { validateMeshGeometry } from "./mesh-quality.js";
import type { Mesh, Triangle } from "./relief-export.js";
const core="http://schemas.microsoft.com/3dmanufacturing/core/2015/02";
const children=(parent:XmlElement,name:string):XmlElement[]=>Array.from(parent.childNodes).filter((node):node is XmlElement=>node.nodeType===1 && (node as XmlElement).localName===name && (node as XmlElement).namespaceURI===parent.namespaceURI);
function parse(xml:string):XmlElement {
  const doc=new DOMParser({onError:(_level,message)=>{throw new Error(message);}}).parseFromString(xml,"application/xml");
  if(!doc.documentElement)throw new Error("Leeres XML-Dokument.");
  return doc.documentElement;
}
function integer(element:XmlElement,attribute:string):number {
  const raw=element.getAttribute(attribute);
  if(!raw || !/^\d+$/.test(raw))throw new Error(`Ungültige 3MF-Referenz ${attribute}.`);
  const value=Number(raw);if(!Number.isSafeInteger(value))throw new Error(`Ungültige 3MF-Referenz ${attribute}.`);return value;
}
export async function inspectThreeMf(data:Buffer):Promise<{errors:string[];triangleCount:number}> {
  const archive=await JSZip.loadAsync(data);
  const errors:string[]=[];
  const modelEntry=archive.file("3D/3dmodel.model");
  const typesEntry=archive.file("[Content_Types].xml"),relationsEntry=archive.file("_rels/.rels");
  if(!typesEntry)errors.push("3MF-Inhaltstypen fehlen.");
  if(!relationsEntry)errors.push("3MF-Beziehungsdatei fehlt.");
  if(!modelEntry)return{errors:[...errors,"3MF-Modellbeschreibung fehlt."],triangleCount:0};
  if(typesEntry){const types=parse(await typesEntry.async("string"));if(types.localName!=="Types"||types.namespaceURI!=="http://schemas.openxmlformats.org/package/2006/content-types")errors.push("Ungültige 3MF-Inhaltstypen.");if(!children(types,"Default").some(t=>t.getAttribute("Extension")==="model"&&t.getAttribute("ContentType")==="application/vnd.ms-package.3dmanufacturing-3dmodel+xml") && !children(types,"Override").some(t=>t.getAttribute("PartName")==="/3D/3dmodel.model" && t.getAttribute("ContentType")==="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"))errors.push("3MF-Modell-Inhaltstyp fehlt.");}
  if(relationsEntry){const relations=parse(await relationsEntry.async("string"));if(relations.localName!=="Relationships"||relations.namespaceURI!=="http://schemas.openxmlformats.org/package/2006/relationships")errors.push("Ungültige 3MF-Beziehungen.");if(!children(relations,"Relationship").some(r=>r.getAttribute("Type")==="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"&&r.getAttribute("TargetMode")!=="External"&&posix.resolve("/",r.getAttribute("Target")??"")==="/3D/3dmodel.model"))errors.push("3MF-Modellbeziehung ist ungültig.");}
  const model=parse(await modelEntry.async("string"));
  if(model.localName!=="model"||model.namespaceURI!==core)errors.push("Ungültiger 3MF-Modell-Namensraum.");
  if(model.getAttribute("unit")!=="millimeter")errors.push("3MF verwendet nicht Millimeter als Einheit.");
  const resources=children(model,"resources")[0];if(!resources)return{errors:[...errors,"3MF-Ressourcen fehlen."],triangleCount:0};
  const objects=new Map<number,XmlElement>(),materials=new Map<number,number>(),ids=new Set<number>();
  for(const resource of Array.from(resources.childNodes).filter((n):n is XmlElement=>n.nodeType===1)){
    const id=integer(resource,"id");if(id<1||ids.has(id))errors.push("3MF-Ressourcen-IDs sind ungültig oder doppelt.");ids.add(id);
    if(resource.localName==="object")objects.set(id,resource);
    if(resource.localName==="basematerials")materials.set(id,children(resource,"base").length);
  }
  let triangleCount=0;
  const validateMaterial=(element:XmlElement,object:XmlElement)=>{
    const owner=element.hasAttribute("pid")?element:object;
    if(!owner.hasAttribute("pid"))return;
    const count=materials.get(integer(owner,"pid"));
    const defaults=object.hasAttribute("pindex")?integer(object,"pindex"):0;
    const first=element.hasAttribute("p1")?integer(element,"p1"):defaults;
    const indices=[first,...["p2","p3"].filter(a=>element.hasAttribute(a)).map(a=>integer(element,a))];
    if(count===undefined||indices.some(i=>i>=count))errors.push("3MF-Dreieck verweist auf ungültiges Material.");
  };
  for(const object of objects.values()){
    const meshes=children(object,"mesh"),components=children(object,"components");
    if(meshes.length+components.length!==1){errors.push("3MF-Objekt muss genau ein Mesh oder Komponenten enthalten.");continue;}
    if(!meshes.length)continue;
    const vertexContainer=children(meshes[0],"vertices")[0],triangleContainer=children(meshes[0],"triangles")[0];
    const mesh:Mesh={vertices:vertexContainer?children(vertexContainer,"vertex").map(v=>["x","y","z"].map(a=>v.getAttribute(a)?.trim() ? Number(v.getAttribute(a)) : NaN) as [number,number,number]):[],triangles:[]};
    for(const triangle of triangleContainer?children(triangleContainer,"triangle"):[]){mesh.triangles.push(["v1","v2","v3"].map(a=>integer(triangle,a)) as unknown as Triangle);validateMaterial(triangle,object);}
    triangleCount+=mesh.triangles.length;
    if(!mesh.vertices.length||!mesh.triangles.length)errors.push("3MF enthält keine verwertbare Meshgeometrie.");
    const geometry=validateMeshGeometry(mesh);errors.push(...geometry.errors);
  }
  const visit=(id:number,path:Set<number>)=>{
    const object=objects.get(id);if(!object){errors.push("3MF verweist auf ein fehlendes Objekt.");return;}
    if(path.has(id)){errors.push("3MF enthält zyklische Komponenten.");return;}
    const next=new Set(path).add(id);
    for(const group of children(object,"components"))for(const c of children(group,"component")){if(c.hasAttribute("p:path")){errors.push("Externe 3MF-Komponenten werden nicht unterstützt.");continue;}visit(integer(c,"objectid"),next);}
  };
  for(const id of objects.keys())visit(id,new Set());
  const build=children(model,"build")[0],items=build?children(build,"item"):[];
  if(items.length!==1)errors.push("3MF muss genau ein gemeinsames Build-Objekt enthalten.");
  for(const item of items)visit(integer(item,"objectid"),new Set());
  if(!triangleCount)errors.push("3MF enthält keine verwertbare Meshgeometrie.");
  return{errors:[...new Set(errors)],triangleCount};
}
