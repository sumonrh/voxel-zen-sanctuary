import * as THREE from 'three';
import { mulberry32, clamp, vnoise } from './utils.js';

export const TEX_CACHE = {};

function makeCanvas(){
  const c=document.createElement('canvas'); c.width=c.height=16;
  const g=c.getContext('2d'); g.imageSmoothingEnabled=false; return {c,g};
}
function toTex(c){
  const t=new THREE.CanvasTexture(c);
  t.magFilter=THREE.NearestFilter;
  t.minFilter=THREE.NearestMipmapNearestFilter;
  t.generateMipmaps=true;
  t.colorSpace=THREE.SRGBColorSpace;
  t.anisotropy=4;
  return t;
}
function shade(hex,amt){
  const n=parseInt(hex.slice(1),16);
  let r=(n>>16)+amt, g=((n>>8)&255)+amt, b=(n&255)+amt;
  r=clamp(r,0,255)|0; g=clamp(g,0,255)|0; b=clamp(b,0,255)|0;
  return '#'+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1);
}
function texNoise(base, spread=18, density=0.55, seed=1){
  const {c,g}=makeCanvas(); const R=mulberry32(seed*7919+13);
  g.fillStyle=base; g.fillRect(0,0,16,16);
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){
    if(R()<density){ const d=Math.floor((R()*2-1)*spread); g.fillStyle=shade(base,d); g.fillRect(x,y,1,1);} }
  return c;
}
function texWood(base, dark=-26, seed=3){
  const {c,g}=makeCanvas(); const R=mulberry32(seed*104729+7);
  g.fillStyle=base; g.fillRect(0,0,16,16);
  for(let x=0;x<16;x++){
    const d=Math.floor((R()*2-1)*10); g.fillStyle=shade(base,d); g.fillRect(x,0,1,16);
    if(R()<0.28){ g.fillStyle=shade(base,dark);
      const y0=Math.floor(R()*10), len=3+Math.floor(R()*6); g.fillRect(x,y0,1,len); }
  }
  g.fillStyle=shade(base,dark-8); g.fillRect(0,0,16,1); g.fillRect(0,15,16,1);
  return c;
}
function texPlank(base, seed=5){
  const {c,g}=makeCanvas(); const R=mulberry32(seed*15485863+3);
  g.fillStyle=base; g.fillRect(0,0,16,16);
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){
    if(R()<0.5){g.fillStyle=shade(base,Math.floor((R()*2-1)*12));g.fillRect(x,y,1,1);} }
  g.fillStyle=shade(base,-40);
  g.fillRect(0,3,16,1); g.fillRect(0,8,16,1); g.fillRect(0,13,16,1);
  return c;
}
function texShoji(){
  const {c,g}=makeCanvas();
  g.fillStyle='#ffe3b0'; g.fillRect(0,0,16,16);
  const R=mulberry32(4242);
  for(let y=0;y<16;y++)for(let x=0;x<16;x++)
    if(R()<0.35){g.fillStyle=shade('#ffe3b0',Math.floor((R()*2-1)*10));g.fillRect(x,y,1,1);}
  g.fillStyle='#4a3222';
  g.fillRect(0,0,16,1); g.fillRect(0,15,16,1); g.fillRect(0,0,1,16); g.fillRect(15,0,1,16);
  g.fillRect(0,7,16,1); g.fillRect(7,0,1,16);
  return c;
}
function texRoof(base){
  const {c,g}=makeCanvas(); const R=mulberry32(9109);
  g.fillStyle=base; g.fillRect(0,0,16,16);
  for(let y=0;y<16;y++)for(let x=0;x<16;x++)
    if(R()<0.4){g.fillStyle=shade(base,Math.floor((R()*2-1)*14));g.fillRect(x,y,1,1);}
  for(let x=0;x<16;x+=4){ g.fillStyle=shade(base,-30); g.fillRect(x,0,1,16);
    g.fillStyle=shade(base,22); g.fillRect(x+1,0,1,16); }
  g.fillStyle=shade(base,-34); g.fillRect(0,0,16,1);
  return c;
}
function texWater(){
  const {c,g}=makeCanvas(); const R=mulberry32(777);
  g.fillStyle='#2f6fb0'; g.fillRect(0,0,16,16);
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){
    const n=vnoise(x*0.5,y*0.5); g.fillStyle=shade('#2f6fb0',Math.floor((n-0.5)*40));
    g.fillRect(x,y,1,1);
    if(R()<0.05){g.fillStyle='#8fc4e8';g.fillRect(x,y,1,1);} }
  return c;
}
function texSand(){
  const {c,g}=makeCanvas(); const R=mulberry32(31337);
  g.fillStyle='#ded3b6'; g.fillRect(0,0,16,16);
  for(let y=0;y<16;y++)for(let x=0;x<16;x++)
    if(R()<0.4){g.fillStyle=shade('#ded3b6',Math.floor((R()*2-1)*10));g.fillRect(x,y,1,1);}
  for(let y=1;y<16;y+=3){g.fillStyle=shade('#ded3b6',-22);g.fillRect(0,y,16,1);}
  return c;
}
function texWool(){
  const {c,g}=makeCanvas(); const R=mulberry32(5150);
  g.fillStyle='#f6f3ec'; g.fillRect(0,0,16,16);
  for(let i=0;i<40;i++){ const x=Math.floor(R()*16),y=Math.floor(R()*16);
    g.fillStyle=shade('#f6f3ec',-Math.floor(R()*22)); g.fillRect(x,y,2,2); }
  return c;
}
function texLeaf(base,seed){
  const {c,g}=makeCanvas(); const R=mulberry32(seed);
  g.fillStyle=base; g.fillRect(0,0,16,16);
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){
    const r=R(); if(r<0.3)g.fillStyle=shade(base,-24); else if(r<0.55)g.fillStyle=shade(base,16); else continue;
    g.fillRect(x,y,1,1); }
  return c;
}
function texBamboo(){
  const {c,g}=makeCanvas();
  g.fillStyle='#8fb63f'; g.fillRect(0,0,16,16);
  for(let x=0;x<16;x++){ g.fillStyle=shade('#8fb63f',x<3||x>12?-24:10); g.fillRect(x,0,1,16); }
  g.fillStyle='#6d8f2c'; g.fillRect(0,1,16,2); g.fillRect(0,13,16,2);
  return c;
}
function texGold(){
  const {c,g}=makeCanvas(); const R=mulberry32(24601);
  g.fillStyle='#e8c04a'; g.fillRect(0,0,16,16);
  for(let y=0;y<16;y++)for(let x=0;x<16;x++)
    if(R()<0.45){g.fillStyle=shade('#e8c04a',Math.floor((R()*2-1)*26));g.fillRect(x,y,1,1);}
  g.fillStyle='#fff0b0'; g.fillRect(4,0,2,16);
  return c;
}
function texBrick(base){
  const {c,g}=makeCanvas(); const R=mulberry32(8675309);
  g.fillStyle=base; g.fillRect(0,0,16,16);
  for(let y=0;y<16;y++)for(let x=0;x<16;x++)
    if(R()<0.45){g.fillStyle=shade(base,Math.floor((R()*2-1)*16));g.fillRect(x,y,1,1);}
  g.fillStyle=shade(base,-34);
  g.fillRect(0,5,16,1); g.fillRect(0,11,16,1); g.fillRect(7,0,1,5); g.fillRect(3,6,1,5); g.fillRect(11,12,1,4);
  return c;
}
export function T(name){ return TEX_CACHE[name]; }
export function buildTextures(){
  const defs={
    grass:     ()=>texNoise('#6aa84f',22,0.6,11),
    grassDeep: ()=>texNoise('#4e8a3c',20,0.6,12),
    dirt:      ()=>texNoise('#7a5a3a',20,0.6,13),
    rock:      ()=>texNoise('#7c8489',24,0.65,14),
    rockDark:  ()=>texNoise('#5d666c',22,0.65,15),
    snow:      ()=>texNoise('#f0f5fb',10,0.5,16),
    stone:     ()=>texBrick('#9a9a96'),
    stoneDark: ()=>texBrick('#6f7370'),
    wood:      ()=>texWood('#3d2b20',-24,17),
    woodMid:   ()=>texWood('#6b4a32',-22,18),
    plank:     ()=>texPlank('#8a6242',19),
    red:       ()=>texWood('#c0392b',-30,20),
    redDark:   ()=>texWood('#8f2a20',-26,21),
    roof:      ()=>texRoof('#2f3440'),
    roofRidge: ()=>texRoof('#1f232c'),
    shoji:     ()=>texShoji(),
    gold:      ()=>texGold(),
    water:     ()=>texWater(),
    sand:      ()=>texSand(),
    wool:      ()=>texWool(),
    leaf:      ()=>texLeaf('#3f7a35',22),
    leafDark:  ()=>texLeaf('#2f5f28',23),
    bamboo:    ()=>texBamboo(),
    sakura:    ()=>texLeaf('#f0a6c6',24),
    sakuraLt:  ()=>texLeaf('#f8c6dc',25),
    trunk:     ()=>texWood('#5b4436',-22,26),
    lily:      ()=>texLeaf('#57a83f',27),
    paper:     ()=>texNoise('#ffcf7a',12,0.4,28),
    skin:      ()=>texNoise('#e0ac86',10,0.35,29),
    lacquer:   ()=>texNoise('#8e2b24',14,0.45,30),
    cloth:     ()=>texNoise('#2b3550',14,0.45,31),
    steel:     ()=>texNoise('#b8c0c8',16,0.5,32),
    alpaca:    ()=>texNoise('#d8c3a5',14,0.5,33),
    dark:      ()=>texNoise('#26262c',12,0.5,34),
    cloud:     ()=>texNoise('#ffffff',8,0.35,35),
    sun:       ()=>texNoise('#fff3c4',6,0.3,36),
    moon:      ()=>texNoise('#dfe8f7',10,0.4,37),
    crimson:   ()=>texNoise('#b21a2b',16,0.55,38),
    crimsonDark:()=>texNoise('#7a1220',16,0.55,39),
    goldTrim:  ()=>texNoise('#d4a843',14,0.5,40)
  };
  for(const k in defs) TEX_CACHE[k]=toTex(defs[k]());
}
