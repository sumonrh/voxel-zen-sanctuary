import * as THREE from 'three';
import { TEX_CACHE, T } from './textures.js';

export const MAT={};
export const EMISSIVE_KEYS=['shoji','paper','gold'];

export function buildMaterials(){
  const L=(name,extra={})=>new THREE.MeshLambertMaterial(Object.assign({map:T(name)},extra));
  for(const k in TEX_CACHE) MAT[k]=L(k);
  MAT.water = new THREE.MeshLambertMaterial({map:T('water'),transparent:true,opacity:0.82});
  MAT.shoji = new THREE.MeshLambertMaterial({map:T('shoji'),emissive:new THREE.Color(0xffb457),emissiveIntensity:0.45});
  MAT.paper = new THREE.MeshLambertMaterial({map:T('paper'),emissive:new THREE.Color(0xffa63d),emissiveIntensity:0.7});
  MAT.gold  = new THREE.MeshPhongMaterial({map:T('gold'),shininess:70,specular:0x8a6a20, emissive:new THREE.Color(0x3a2a00),emissiveIntensity:0.25});
  MAT.steel = new THREE.MeshPhongMaterial({map:T('steel'),shininess:55,specular:0x556070});
  MAT.sun   = new THREE.MeshBasicMaterial({map:T('sun'),fog:false});
  MAT.moon  = new THREE.MeshBasicMaterial({map:T('moon'),fog:false});
  MAT.cloud = new THREE.MeshLambertMaterial({map:T('cloud'),transparent:true,opacity:0.94,fog:true});
  MAT.sakura   = new THREE.MeshLambertMaterial({map:T('sakura')});
  MAT.sakuraLt = new THREE.MeshLambertMaterial({map:T('sakuraLt')});
  MAT.crimson  = new THREE.MeshLambertMaterial({map:T('crimson')});
  MAT.crimsonDark = new THREE.MeshLambertMaterial({map:T('crimsonDark')});
}
