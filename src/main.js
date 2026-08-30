import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RNG, rnd, rndi, pick, clamp, lerp, smooth, vnoise, fbm } from './core/utils.js';
import { WORLD } from './core/config.js';
import { TEX_CACHE, T, buildTextures } from './core/textures.js';
import { MAT, EMISSIVE_KEYS, buildMaterials } from './core/materials.js';

/* =======================================================================
   BATCHER — variable-size blocks packed into InstancedMeshes
   ======================================================================= */
const UNIT = new THREE.BoxGeometry(1,1,1);
let VOXEL_COUNT = 0;
class Batcher{
  constructor(){ this.buckets=new Map(); }
  add(kind,cx,cy,cz,sx,sy=sx,sz=sx,rot=null){
    if(!this.buckets.has(kind)) this.buckets.set(kind,[]);
    this.buckets.get(kind).push([cx,cy,cz,sx,sy,sz,rot]); VOXEL_COUNT++;
    return this;
  }
  addAt(kind,x,y,z,sx,sy=sx,sz=sx){ return this.add(kind,x+sx/2,y+sy/2,z+sz/2,sx,sy,sz); }
  column(kind,cx,cz,y0,y1,sx,sz=sx){ return this.add(kind,cx,(y0+y1)/2,cz,sx,Math.max(0.001,y1-y0),sz); }
  count(){ let n=0; for(const v of this.buckets.values()) n+=v.length; return n; }
  build(parent,{cast=true,receive=true}={}){
    const made=[];
    const m=new THREE.Matrix4(), q=new THREE.Quaternion(), e=new THREE.Euler(),
          p=new THREE.Vector3(), s=new THREE.Vector3();
    for(const [kind,list] of this.buckets){
      const mat = MAT[kind]||MAT.stone;
      const im  = new THREE.InstancedMesh(UNIT, mat, list.length);
      im.name='batch_'+kind;
      for(let i=0;i<list.length;i++){
        const [cx,cy,cz,sx,sy,sz,rot]=list[i];
        p.set(cx,cy,cz); s.set(sx,sy,sz);
        if(rot){ e.set(rot.x||0,rot.y||0,rot.z||0); q.setFromEuler(e);} else q.identity();
        m.compose(p,q,s); im.setMatrixAt(i,m);
      }
      im.instanceMatrix.needsUpdate=true;
      im.castShadow=cast; im.receiveShadow=receive;
      im.frustumCulled=true;
      parent.add(im); made.push(im);
    }
    this.buckets.clear();
    return made;
  }
}

/* =======================================================================
   SCENE / RENDERER / CAMERA
   ======================================================================= */
const scene   = new THREE.Scene();
const camera  = new THREE.PerspectiveCamera(52, innerWidth/innerHeight, 0.5, 2600);
camera.position.set(62,44,110);

const renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.0;
document.body.appendChild(renderer.domElement);

const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true; controls.dampingFactor=0.055;
controls.maxPolarAngle=Math.PI*0.495;
controls.minDistance=8; controls.maxDistance=430;
controls.target.set(0,10,0);
controls.autoRotateSpeed=0.35;

const skyUniforms={
  top:{value:new THREE.Color(0x3f7fd0)},
  bottom:{value:new THREE.Color(0xbfe0f5)},
  offset:{value:120.0}, expo:{value:0.72}
};
const skyDome=new THREE.Mesh(
  new THREE.SphereGeometry(1500,24,16),
  new THREE.ShaderMaterial({
    uniforms:skyUniforms, side:THREE.BackSide, depthWrite:false, fog:false,
    vertexShader:`varying vec3 vP; void main(){vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`uniform vec3 top; uniform vec3 bottom; uniform float offset; uniform float expo;
      varying vec3 vP; void main(){ float h=normalize(vP+vec3(0.0,offset,0.0)).y;
      gl_FragColor=vec4(mix(bottom,top,pow(max(h,0.0),expo)),1.0);} `
  })
);
skyDome.frustumCulled=false; scene.add(skyDome);
scene.fog=new THREE.Fog(0xbfe0f5,180,900);

/* =======================================================================
   WORLD HEIGHT FIELD
   ======================================================================= */
function terrainHeight(x,z){
  const r=Math.hypot(x,z);
  let h = (fbm(x*0.010+40,z*0.010+40,3)-0.5)*3.0;
  if(r<WORLD.plateauR){ h*= smooth(clamp(r/WORLD.plateauR,0,1))*0.9; }
  if(r>WORLD.mountStart){
    const t=clamp((r-WORLD.mountStart)/(WORLD.half-WORLD.mountStart),0,1);
    const ridge = 1.0-Math.abs(fbm(x*0.0085,z*0.0085,4)*2.0-1.0);
    const bulk  = fbm(x*0.0042+9,z*0.0042+9,4);
    const ang   = Math.atan2(z,x);
    const lobes = 0.62+0.38*Math.abs(Math.sin(ang*2.6+fbm(x*0.003,z*0.003,2)*3.0));
    h += Math.pow(t,1.00)*(ridge*92+bulk*68)*lobes;
    h += Math.pow(t,1.9)*44;
  } else if(r>WORLD.plateauR){
    const t=clamp((r-WORLD.plateauR)/(WORLD.mountStart-WORLD.plateauR),0,1);
    h += smooth(t)*(6+fbm(x*0.02,z*0.02,3)*13);
  }
  const P=WORLD.pond;
  const pd=Math.hypot((x-P.x)/P.rx,(z-P.z)/P.rz);
  if(pd<1.25){
    const dig = smooth(clamp((1.25-pd)/1.25,0,1));
    h = lerp(h, P.floor, dig);
  }
  return h;
}
function surfaceKind(x,z,h){
  const r=Math.hypot(x,z);
  if(h>WORLD.snowLine + fbm(x*0.05,z*0.05,2)*10) return 'snow';
  if(h>34) return 'rockDark';
  if(h>17) return 'rock';
  const P=WORLD.pond;
  const pd=Math.hypot((x-P.x)/P.rx,(z-P.z)/P.rz);
  if(pd<1.14) return 'dirt';
  if(r>WORLD.plateauR+18 && fbm(x*0.03,z*0.03,2)>0.62) return 'grassDeep';
  return 'grass';
}

/* =======================================================================
   LIGHTING + DAY/NIGHT
   ======================================================================= */
const hemi = new THREE.HemisphereLight(0xbfe0ff,0x4a5a3a,0.85); scene.add(hemi);
const ambient = new THREE.AmbientLight(0xffffff,0.22); scene.add(ambient);

const sunLight = new THREE.DirectionalLight(0xfff2d0,1.5);
sunLight.castShadow=true;
sunLight.shadow.mapSize.set(2048,2048);
sunLight.shadow.camera.near=1; sunLight.shadow.camera.far=760;
const SH=185;
sunLight.shadow.camera.left=-SH; sunLight.shadow.camera.right=SH;
sunLight.shadow.camera.top=SH;   sunLight.shadow.camera.bottom=-SH;
sunLight.shadow.bias=-0.0008; sunLight.shadow.normalBias=0.55;
scene.add(sunLight); scene.add(sunLight.target);
sunLight.target.position.set(0,0,0);

const fill = new THREE.DirectionalLight(0x9fc4ff,0.28);
fill.position.set(-120,90,-140); scene.add(fill);

const celestial = new THREE.Mesh(UNIT, MAT.sun || new THREE.MeshBasicMaterial({color:0xffffff}));
celestial.scale.setScalar(34); celestial.frustumCulled=false; scene.add(celestial);
const celestialGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  color:0xffe6a8, transparent:true, opacity:0.34, depthWrite:false, fog:false
}));
celestialGlow.scale.setScalar(150); scene.add(celestialGlow);

const TIME_PRESETS={
  morning:{
    label:'Morning',
    skyTop:0x3f7fd0, skyBot:0xcfe8fa, fog:0xcadff0, fogNear:200, fogFar:960,
    sunPos:[-330,300,260], sunColor:0xfff4dc, sunInt:1.55,
    hemiSky:0xbfe0ff, hemiGnd:0x4a5a3a, hemiInt:0.85, ambInt:0.24,
    fillColor:0x9fc4ff, fillInt:0.28,
    celMat:'sun', celScale:34, glow:0xffeec0, glowOp:0.30, glowScale:150,
    lantern:0.0, emissive:0.18, exposure:1.02, star:0.0
  },
  sunset:{
    label:'Sunset',
    skyTop:0x2c3f7a, skyBot:0xf7a75c, fog:0xe89a63, fogNear:150, fogFar:820,
    sunPos:[-420,90,-90], sunColor:0xffb06a, sunInt:1.5,
    hemiSky:0xffc79a, hemiGnd:0x54402c, hemiInt:0.72, ambInt:0.22,
    fillColor:0xff9e70, fillInt:0.3,
    celMat:'sun', celScale:44, glow:0xff9048, glowOp:0.55, glowScale:250,
    lantern:0.55, emissive:0.62, exposure:1.06, star:0.0
  },
  night:{
    label:'Night',
    skyTop:0x05070f, skyBot:0x18244a, fog:0x101a33, fogNear:110, fogFar:700,
    sunPos:[300,270,-180], sunColor:0x9fb6e8, sunInt:0.36,
    hemiSky:0x30456e, hemiGnd:0x0d1220, hemiInt:0.30, ambInt:0.13,
    fillColor:0x5f7ab4, fillInt:0.14,
    celMat:'moon', celScale:26, glow:0xcfe0ff, glowOp:0.40, glowScale:130,
    lantern:2.5, emissive:1.5, exposure:1.15, star:1.0
  }
};
let currentTime='morning';
const lanternLights=[];
let starField=null;

function applyTime(name,instant=false){
  const p=TIME_PRESETS[name]; if(!p) return;
  currentTime=name;
  skyUniforms.top.value.setHex(p.skyTop);
  skyUniforms.bottom.value.setHex(p.skyBot);
  scene.fog.color.setHex(p.fog); scene.fog.near=p.fogNear; scene.fog.far=p.fogFar;
  renderer.setClearColor(p.fog,1);
  sunLight.position.set(...p.sunPos);
  sunLight.color.setHex(p.sunColor); sunLight.intensity=p.sunInt;
  hemi.color.setHex(p.hemiSky); hemi.groundColor.setHex(p.hemiGnd); hemi.intensity=p.hemiInt;
  ambient.intensity=p.ambInt;
  fill.color.setHex(p.fillColor); fill.intensity=p.fillInt;
  renderer.toneMappingExposure=p.exposure;

  celestial.material = p.celMat==='moon'?MAT.moon:MAT.sun;
  celestial.scale.setScalar(p.celScale);
  const d=new THREE.Vector3(...p.sunPos).normalize().multiplyScalar(880);
  celestial.position.copy(d);
  celestialGlow.position.copy(d);
  celestialGlow.material.color.setHex(p.glow);
  celestialGlow.material.opacity=p.glowOp;
  celestialGlow.scale.setScalar(p.glowScale);

  for(const L of lanternLights){ L.light.intensity = L.base*p.lantern; L.light.visible = p.lantern>0.01; }
  for(const k of EMISSIVE_KEYS){ if(MAT[k]&&MAT[k].emissiveIntensity!==undefined)
      MAT[k].emissiveIntensity = (k==='gold'?0.25:1)* (k==='shoji'?0.45:1) * 1 + p.emissive*(k==='gold'?0.2:0.9); }
  MAT.shoji.emissiveIntensity = 0.30 + p.emissive*0.95;
  MAT.paper.emissiveIntensity = 0.45 + p.emissive*1.25;
  MAT.gold.emissiveIntensity  = 0.18 + p.emissive*0.30;
  if(starField) starField.material.opacity = p.star;
  const el=document.getElementById('s-time'); if(el) el.textContent=p.label;
}

/* =======================================================================
   TERRAIN + MOUNTAINS
   ======================================================================= */
const worldGroup=new THREE.Group(); scene.add(worldGroup);

function buildTerrain(){
  const B=new Batcher();
  const half=WORLD.half;
  const emit=(x,z,step)=>{
    const h=terrainHeight(x,z);
    const top=Math.round(h/ (step>=4?2:1))*(step>=4?2:1);
    const kind=surfaceKind(x,z,top);
    const capH = step>=4?3:2;
    B.add(kind, x+step/2, top-capH/2, z+step/2, step, capH, step);
    const base = Math.min(top-capH, -10);
    const bodyKind = top>26?'rockDark':(top<2?'dirt':'rock');
    if(top-capH > base+0.5)
      B.add(bodyKind, x+step/2, (base+top-capH)/2, z+step/2, step, (top-capH)-base, step);
    if(kind==='rock' && top>WORLD.snowLine-16 && fbm(x*0.06+5,z*0.06+5,2)>0.58)
      B.add('snow', x+step/2, top+0.5, z+step/2, step, 1, step);
  };
  for(let x=-half;x<half;x+=WORLD.coarse){
    for(let z=-half;z<half;z+=WORLD.coarse){
      const r=Math.hypot(x+2,z+2);
      if(r>half) continue;
      if(r<WORLD.fineR) continue;
      emit(x,z,WORLD.coarse);
    }
  }
  for(let x=-WORLD.fineR;x<WORLD.fineR;x+=WORLD.fine){
    for(let z=-WORLD.fineR;z<WORLD.fineR;z+=WORLD.fine){
      if(Math.hypot(x+1,z+1)>=WORLD.fineR) continue;
      emit(x,z,WORLD.fine);
    }
  }
  B.build(worldGroup,{cast:true,receive:true});
}

let waterMesh=null; const lilyPads=[];
function buildWater(){
  const P=WORLD.pond, B=new Batcher(), step=2;
  for(let x=P.x-P.rx-4;x<=P.x+P.rx+4;x+=step)
    for(let z=P.z-P.rz-4;z<=P.z+P.rz+4;z+=step){
      const pd=Math.hypot((x+step/2-P.x)/P.rx,(z+step/2-P.z)/P.rz);
      if(pd>1.06) continue;
      B.add('water', x+step/2, P.water, z+step/2, step, 0.5, step);
    }
  const meshes=B.build(worldGroup,{cast:false,receive:true});
  waterMesh=meshes[0]||null;

  const L=new Batcher();
  for(let i=0;i<34;i++){
    const a=rnd(Math.PI*2), rr=Math.sqrt(rnd(1))*0.86;
    const x=P.x+Math.cos(a)*P.rx*rr, z=P.z+Math.sin(a)*P.rz*rr;
    const y=P.water+0.32, s=0.5;
    const pat=[[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1]];
    const n=rndi(4,7);
    for(let k=0;k<n;k++){ const[dx,dz]=pat[k];
      L.add('lily', x+dx*s, y, z+dz*s, s, 0.18, s); }
    if(RNG()<0.34){
      L.add('sakuraLt', x, y+0.22, z, 0.3,0.3,0.3);
      L.add('sakura',   x, y+0.42, z, 0.18,0.18,0.18);
    }
    lilyPads.push({x,z,phase:rnd(Math.PI*2)});
  }
  L.build(worldGroup,{cast:false,receive:true});
}

function buildStars(){
  const N=1400, pos=new Float32Array(N*3);
  for(let i=0;i<N;i++){
    const u=rnd(1), v=rnd(1);
    const th=2*Math.PI*u, ph=Math.acos(2*v-1);
    const R=1180+rnd(120);
    const y=Math.abs(R*Math.cos(ph));
    pos[i*3]=R*Math.sin(ph)*Math.cos(th);
    pos[i*3+1]=y*0.9+60;
    pos[i*3+2]=R*Math.sin(ph)*Math.sin(th);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  starField=new THREE.Points(g,new THREE.PointsMaterial({
    color:0xffffff,size:4.2,sizeAttenuation:true,transparent:true,opacity:0,
    depthWrite:false,fog:false}));
  starField.frustumCulled=false; scene.add(starField);
}

/* =======================================================================
   ARCHITECTURE
   ======================================================================= */
const B = new Batcher();

function ring(kind,cx,cy,cz,w,d,t=1,h=1){
  for(let x=-w/2;x<w/2;x+=1){
    B.add(kind,cx+x+0.5,cy,cz-d/2+t/2,1,h,t);
    B.add(kind,cx+x+0.5,cy,cz+d/2-t/2,1,h,t);
  }
  for(let z=-d/2+t;z<d/2-t;z+=1){
    B.add(kind,cx-w/2+t/2,cy,cz+z+0.5,t,h,1);
    B.add(kind,cx+w/2-t/2,cy,cz+z+0.5,t,h,1);
  }
}
function slab(kind,cx,cy,cz,w,d,h=1){
  for(let x=-w/2;x<w/2;x+=1)
    for(let z=-d/2;z<d/2;z+=1)
      B.add(kind,cx+x+0.5,cy,cz+z+0.5,1,h,1);
}
function pagodaRoof(cx,cy,cz,span,layers=4){
  for(let i=0;i<layers;i++){
    const w=span-i*2, y=cy+i*0.75;
    if(w<=0) break;
    for(let x=-w/2;x<w/2;x+=1)
      for(let z=-w/2;z<w/2;z+=1){
        const ax=Math.abs(x+0.5), az=Math.abs(z+0.5);
        if(ax<w/2-1.2 && az<w/2-1.2 && i<layers-1) continue;
        B.add(i===0?'roofRidge':'roof', cx+x+0.5,y,cz+z+0.5,1,0.75,1);
      }
  }
  const e=span/2;
  const corners=[[1,1],[1,-1],[-1,1],[-1,-1]];
  for(const [sx,sz] of corners){
    for(let k=0;k<4;k++){
      const off=e+k*0.55;
      const lift=cy-0.1+k*k*0.28;
      B.add('roofRidge', cx+sx*off, lift, cz+sz*off, 1.1,0.55,1.1);
      if(k===3){
        B.add('gold', cx+sx*(off+0.5), lift+0.55, cz+sz*(off+0.5), 0.5,0.5,0.5);
      }
    }
    for(let k=1;k<=Math.floor(span/2)-1;k++){
      B.add('roof', cx+sx*e, cy-0.15, cz+sz*(e-k), 1.0,0.5,1.0);
      B.add('roof', cx+sx*(e-k), cy-0.15, cz+sz*e, 1.0,0.5,1.0);
    }
  }
}
function pagodaStorey(cx,cy,cz,w,d,h){
  const px=[-w/2+0.5, w/2-0.5], pz=[-d/2+0.5, d/2-0.5];
  for(const x of px) for(const z of pz) B.column('wood',cx+x,cz+z,cy,cy+h,1,1);
  for(const x of px){ B.column('wood',cx+x,cz,cy,cy+h,1,1); }
  for(const z of pz){ B.column('wood',cx,cz+z,cy,cy+h,1,1); }
  for(let x=-w/2+1;x<w/2-1;x+=1){
    if(Math.abs(x+0.5)<0.6) continue;
    for(let y=1;y<h-1;y++){
      B.add('shoji',cx+x+0.5,cy+y+0.5,cz-d/2+0.5,1,1,0.35);
      B.add('shoji',cx+x+0.5,cy+y+0.5,cz+d/2-0.5,1,1,0.35);
    }
  }
  for(let z=-d/2+1;z<d/2-1;z+=1){
    if(Math.abs(z+0.5)<0.6) continue;
    for(let y=1;y<h-1;y++){
      B.add('shoji',cx-w/2+0.5,cy+y+0.5,cz+z+0.5,0.35,1,1);
      B.add('shoji',cx+w/2-0.5,cy+y+0.5,cz+z+0.5,0.35,1,1);
    }
  }
  ring('woodMid',cx,cy+0.5,cz,w,d,1,1);
  ring('wood',   cx,cy+h-0.5,cz,w,d,1,1);
  ring('plank',cx,cy+h+0.15,cz,w+3,d+3,1,0.4);
  for(let x=-(w+3)/2;x<(w+3)/2;x+=1.5){
    B.add('redDark',cx+x,cy+h+0.95,cz-(d+3)/2+0.5,0.28,1.2,0.28);
    B.add('redDark',cx+x,cy+h+0.95,cz+(d+3)/2-0.5,0.28,1.2,0.28);
  }
  for(let z=-(d+3)/2;z<(d+3)/2;z+=1.5){
    B.add('redDark',cx-(w+3)/2+0.5,cy+h+0.95,cz+z,0.28,1.2,0.28);
    B.add('redDark',cx+(w+3)/2-0.5,cy+h+0.95,cz+z,0.28,1.2,0.28);
  }
  ring('red',cx,cy+h+1.6,cz,w+3,d+3,0.5,0.4);
}
function buildPagoda(){
  const {x:cx,z:cz}=WORLD.pagoda;
  const gy=terrainHeight(cx,cz);
  for(let x=-11;x<11;x++) for(let z=-11;z<11;z++)
    B.add('stoneDark',cx+x+0.5,gy+0.5,cz+z+0.5,1,1.6,1);
  for(let x=-9;x<9;x++) for(let z=-9;z<9;z++)
    B.add('stone',cx+x+0.5,gy+1.6,cz+z+0.5,1,1.2,1);
  for(let s=0;s<3;s++)
    for(let x=-3;x<3;x++)
      B.add('stone',cx+x+0.5, gy+0.4+s*0.5, cz+9.5+ (2-s), 1,0.5,1);
  let y=gy+2.2;
  const tiers=[[15,15,6],[13,13,5],[11,11,4.5],[9,9,4]];
  for(let i=0;i<tiers.length;i++){
    const [w,d,h]=tiers[i];
    pagodaStorey(cx,y,cz,w,d,h);
    pagodaRoof(cx, y+h+2.0, cz, w+7-i*0.5, 4);
    y += h+2.6;
  }
  B.column('wood',cx,cz,y-0.5,y+1.2,1.4,1.4);
  B.column('gold',cx,cz,y+1.2,y+9.5,0.85,0.85);
  for(let i=0;i<6;i++){
    const rr=1.9-i*0.16;
    ring('gold',cx,y+2.4+i*1.05,cz,rr*2,rr*2,0.42,0.3);
  }
  B.add('gold',cx,y+10.2,cz,1.5,1.5,1.5);
  B.add('gold',cx,y+11.1,cz,0.7,0.9,0.7);
  for(const [sx,sz] of [[1,1],[1,-1],[-1,1],[-1,-1]])
    hangingLantern(cx+sx*10.5, gy+9.4, cz+sz*10.5);
  return {gy};
}
function buildTorii(cx,cz,scale=1,rotY=0){
  const gy=terrainHeight(cx,cz);
  const H=13*scale, W=15*scale, t=1.1*scale;
  const cos=Math.cos(rotY), sin=Math.sin(rotY);
  const P=(lx,lz)=>[cx+lx*cos-lz*sin, cz+lx*sin+lz*cos];
  for(const s of [-1,1]){
    const [px,pz]=P(s*W/2,0);
    B.add('stoneDark',px,gy+0.4,pz,t*2.1,1.0,t*2.1);
    B.column('red',px,pz,gy+0.6,gy+H,t*1.5,t*1.5);
    B.add('dark',px,gy+H*0.62,pz,t*1.85,0.5,t*1.85);
  }
  B.add('red',cx,gy+H*0.72,cz,W+2.2*scale,t*1.1,t*1.3,{y:rotY});
  B.add('redDark',cx,gy+H+0.35,cz,W+4.2*scale,t*0.85,t*1.5,{y:rotY});
  B.add('red',    cx,gy+H+1.15,cz,W+6.0*scale,t*1.0,t*1.9,{y:rotY});
  for(const s of [-1,1]){
    const [ex,ez]=P(s*(W+6.0*scale)/2,0);
    B.add('red',ex,gy+H+1.6,ez,t*1.5,t*0.9,t*1.9,{y:rotY});
    const [ex2,ez2]=P(s*((W+6.0*scale)/2+0.8*scale),0);
    B.add('red',ex2,gy+H+2.15,ez2,t*1.2,t*0.8,t*1.8,{y:rotY});
  }
  B.add('dark',cx,gy+H*0.83,cz,2.6*scale,2.0*scale,0.4,{y:rotY});
  B.add('gold',cx,gy+H*0.83,cz,1.7*scale,1.2*scale,0.55,{y:rotY});
  for(let i=0;i<4;i++){
    const [sx,sz]=P((-1.5+i)*scale,0);
    B.add('paper',sx,gy+H*0.72-1.1,sz,0.35,1.5,0.35);
  }
}
function buildBridge(){
  const P=WORLD.pond;
  const z0=P.z-P.rz-5, z1=P.z+P.rz+5, len=z1-z0;
  const w=7, rise=6.4;
  const curve = t => Math.sin(Math.PI*t)*rise;
  const steps = Math.round(len);
  for(let i=0;i<=steps;i++){
    const t=i/steps, z=z0+t*len;
    const y = 1.2+curve(t);
    for(let x=-w/2;x<w/2;x+=1)
      B.add('red', P.x+x+0.5, y, z, 1, 0.55, 1.05);
    if(i%2===0){
      for(const s of [-1,1]){
        B.add('redDark', P.x+s*(w/2+0.3), y+1.0, z, 0.42,1.6,0.42);
      }
    }
    for(const s of [-1,1]) B.add('red', P.x+s*(w/2+0.3), y+1.95, z, 0.55,0.42,1.05);
    if(i%6===0 && t>0.08 && t<0.92){
      for(const s of [-1,1]){
        const bx=P.x+s*(w/2-0.8);
        B.column('woodMid',bx,z,P.floor+0.5,y-0.3,0.7,0.7);
      }
    }
  }
  for(const z of [z0-1.5, z1+1.5])
    for(let x=-4;x<4;x++) for(let dz=-2;dz<2;dz++)
      B.add('stone',P.x+x+0.5, 1.0, z+dz+0.5, 1,1.2,1);
  for(const z of [z0,z1]) for(const s of [-1,1]){
    B.column('redDark',P.x+s*(w/2+0.3),z,1.0,4.4,0.8,0.8);
    B.add('gold',P.x+s*(w/2+0.3),4.65,z,0.9,0.55,0.9);
  }
}

/* LANTERNS */
function registerLantern(x,y,z,color=0xffa040,base=1.6,dist=26){
  const l=new THREE.PointLight(color,0,dist,2.0);
  l.position.set(x,y,z); scene.add(l);
  lanternLights.push({light:l,base});
}
function hangingLantern(x,y,z){
  B.add('dark', x,y+1.2,z, 0.18,2.4,0.18);
  B.add('dark', x,y+0.05,z, 0.75,0.18,0.75);
  B.add('paper',x,y-0.55,z, 1.0,1.15,1.0);
  B.add('paper',x,y-1.25,z, 0.8,0.3,0.8);
  B.add('dark', x,y-1.5,z, 0.5,0.16,0.5);
  B.add('redDark',x,y-1.72,z,0.16,0.4,0.16);
  registerLantern(x,y-0.6,z,0xffa843,1.9,26);
}
function stoneLantern(x,z,s=1){
  const gy=terrainHeight(x,z);
  let y=gy;
  B.add('stoneDark',x,y+0.35*s,z,2.4*s,0.7*s,2.4*s);   y+=0.7*s;
  B.column('stone',x,z,y,y+2.6*s,0.85*s,0.85*s);       y+=2.6*s;
  B.add('stone',x,y+0.3*s,z,2.1*s,0.6*s,2.1*s);        y+=0.6*s;
  for(const[sx,sz] of [[1,1],[1,-1],[-1,1],[-1,-1]])
    B.column('stoneDark',x+sx*0.72*s,z+sz*0.72*s,y,y+1.6*s,0.3*s,0.3*s);
  B.add('paper',x,y+0.8*s,z,1.25*s,1.5*s,1.25*s);
  registerLantern(x,y+0.8*s,z,0xffa040,2.2,30);
  y+=1.6*s;
  B.add('stone',x,y+0.25*s,z,2.5*s,0.5*s,2.5*s);
  for(const[sx,sz] of [[1,1],[1,-1],[-1,1],[-1,-1]])
    B.add('stone',x+sx*1.35*s,y+0.55*s,z+sz*1.35*s,0.6*s,0.6*s,0.6*s);
  B.add('stone',x,y+0.75*s,z,1.5*s,0.5*s,1.5*s);
  B.add('stone',x,y+1.15*s,z,0.55*s,0.55*s,0.55*s);
}

/* FLORA */
function bambooStalk(x,z){
  const gy=terrainHeight(x,z);
  const h=rnd(20,11), w=0.55;
  let y=gy;
  while(y<gy+h){
    const seg=rnd(2.4,1.5);
    B.column('bamboo',x,z,y,Math.min(y+seg,gy+h),w,w);
    B.add('leafDark',x,Math.min(y+seg,gy+h),z,w*1.25,0.16,w*1.25);
    y+=seg;
    if(y>gy+h*0.45 && RNG()<0.5){
      const a=rnd(Math.PI*2), L=rnd(2.6,1.4);
      for(let i=1;i<=3;i++)
        B.add('leaf', x+Math.cos(a)*i*L/3, y+i*0.22, z+Math.sin(a)*i*L/3, 0.7,0.14,0.32,{y:a});
    }
  }
  B.add('leaf',x,gy+h+0.3,z,1.1,0.6,1.1);
}
function bambooGrove(cx,cz,r,n){
  for(let i=0;i<n;i++){
    const a=rnd(Math.PI*2), rr=Math.sqrt(rnd(1))*r;
    bambooStalk(cx+Math.cos(a)*rr, cz+Math.sin(a)*rr);
  }
}
function sakuraTree(x,z,scale=1){
  const gy=terrainHeight(x,z), h=rnd(9,6)*scale;
  B.column('trunk',x,z,gy-0.4,gy+h,1.1*scale,1.1*scale);
  const nb=rndi(3,5);
  for(let i=0;i<nb;i++){
    const a=rnd(Math.PI*2), L=rnd(3.4,1.8)*scale, by=gy+h*rnd(0.95,0.55);
    for(let k=1;k<=3;k++)
      B.add('trunk', x+Math.cos(a)*k*L/3, by+k*0.32, z+Math.sin(a)*k*L/3, 0.55*scale,0.5*scale,0.55*scale);
    blossomCluster(x+Math.cos(a)*L, by+1.3, z+Math.sin(a)*L, rnd(2.6,1.7)*scale);
  }
  blossomCluster(x,gy+h+1.2,z,rnd(4.4,3.2)*scale);
  petalSources.push({x,y:gy+h,z,r:4.5*scale});
}
function blossomCluster(cx,cy,cz,r){
  const R=Math.ceil(r);
  for(let x=-R;x<=R;x++)for(let y=-R;y<=R;y++)for(let z=-R;z<=R;z++){
    const d=Math.hypot(x,y*1.25,z);
    if(d>r) continue;
    if(d>r-1 && RNG()<0.45) continue;
    B.add(RNG()<0.32?'sakuraLt':'sakura', cx+x, cy+y, cz+z, 1,1,1);
  }
}
function pineTree(x,z){
  const gy=terrainHeight(x,z), h=rnd(13,8);
  B.column('trunk',x,z,gy-0.4,gy+h,1.1,1.1);
  let r=4.2;
  for(let y=gy+h*0.35;y<gy+h+2;y+=1.5){
    const R=Math.ceil(r);
    for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++){
      if(Math.hypot(dx,dz)>r) continue;
      B.add(RNG()<0.3?'leafDark':'leaf',x+dx,y,z+dz,1,1.5,1);
    }
    r*=0.72;
  }
}
function bush(x,z,s=1){
  const gy=terrainHeight(x,z), R=Math.ceil(1.8*s);
  for(let dx=-R;dx<=R;dx++)for(let dy=0;dy<=R;dy++)for(let dz=-R;dz<=R;dz++){
    if(Math.hypot(dx,dy*1.3,dz)>1.8*s) continue;
    B.add(RNG()<0.28?'leafDark':'leaf', x+dx*0.75, gy+0.4+dy*0.75, z+dz*0.75, 0.8,0.8,0.8);
  }
}
function steppingPath(x0,z0,x1,z1,n){
  for(let i=0;i<=n;i++){
    const t=i/n;
    const x=lerp(x0,x1,t)+Math.sin(t*Math.PI*2.4)*2.6;
    const z=lerp(z0,z1,t)+Math.cos(t*Math.PI*1.7)*1.3;
    const gy=terrainHeight(x,z);
    const w=rnd(2.6,1.8);
    B.add(RNG()<0.35?'stoneDark':'stone', x, gy+0.16, z, w, 0.42, w*rnd(1.15,0.8),
          {y:rnd(0.5,-0.5)});
  }
}
function zenGarden(cx,cz,w,d){
  for(let x=-w/2;x<w/2;x+=1)
    for(let z=-d/2;z<d/2;z+=1)
      B.add('sand',cx+x+0.5, terrainHeight(cx+x,cz+z)+0.2, cz+z+0.5, 1,0.4,1);
  ring('stoneDark',cx,terrainHeight(cx,cz)+0.4,cz,w+2,d+2,1,0.8);
  for(let i=0;i<5;i++){
    const x=cx+rnd(w/2-3,-w/2+3), z=cz+rnd(d/2-3,-d/2+3);
    const s=rnd(2.6,1.2), gy=terrainHeight(x,z);
    B.add('rockDark',x,gy+0.3+s/2,z,s,s*rnd(1.1,0.6),s*rnd(1.2,0.7),{y:rnd(1)});
  }
}
const petalSources=[];

/* =======================================================================
   MICRO-VOXEL ACTORS
   ======================================================================= */
function part(parent,fn,origin=[0,0,0]){
  const g=new THREE.Group(); g.position.set(...origin);
  const b=new Batcher(); fn(b); b.build(g,{cast:true,receive:false});
  parent.add(g); return g;
}
const M=0.25;
function mbox(b,kind,x,y,z,w,h,d){ b.add(kind, x*M, y*M, z*M, w*M, h*M, d*M); }

/* SAMURAI GUARDIAN */
const samurai=[];
function buildSamurai(x,z,rotY,armorKind='lacquer', opts={}){
  const gy=terrainHeight(x,z);
  const root=new THREE.Group();
  root.position.set(x,gy,z); root.rotation.y=rotY;
  root.scale.setScalar(opts.scale||1.15);
  worldGroup.add(root);
  const body=new THREE.Group(); root.add(body);
  const legKind = opts.protagonist ? 'crimson' : 'cloth';
  const accent = opts.protagonist ? 'gold' : 'lacquer';

  part(body,b=>{
    for(const s of [-1,1]){
      mbox(b,legKind, s*2.2, 3.4, 0, 3.4, 7.0, 3.4);
      mbox(b,'dark',  s*2.2, 0.4, 0.3, 3.6, 1.0, 4.2);
      mbox(b,legKind, s*2.2, 6.6, 0, 3.8, 1.2, 3.8);
    }
    if(opts.protagonist){
      mbox(b,'gold', 0, 7.4, 2.6, 2.6, 0.6, 0.5);
      mbox(b,'crimson', 0, 4.8, 0, 4.6, 0.5, 4.6);
    }
  });
  const torso=part(body,b=>{
    mbox(b,armorKind,0, 10.6,0, 7.6, 8.0, 4.6);
    for(let i=0;i<4;i++) mbox(b,'dark', 0, 7.6+i*2.0, 0, 7.9, 0.45, 4.9);
    mbox(b,'gold',  0, 12.4, 2.45, 2.2, 2.2, 0.4);
    mbox(b,'cloth', 0, 14.9, 0, 6.2, 1.4, 4.2);
    for(const s of [-1,1]){
      mbox(b,armorKind, s*2.4, 5.6, 0, 3.2, 3.2, 4.9);
      mbox(b,'dark',    s*2.4, 4.1, 0, 3.4, 0.4, 5.1);
    }
    mbox(b,armorKind, 0, 5.6, 2.3, 6.0, 3.4, 0.6);
    if(opts.protagonist){
      // extra crest + sash
      mbox(b,'crimson', 0, 13.8, 2.5, 3.2, 0.4, 0.5);
      mbox(b,'gold', 0, 9.2, 2.6, 6.6, 0.4, 0.35);
    }
  },[0,0,0]);

  const arms=[];
  for(const s of [-1,1]){
    const arm=part(body,b=>{
      const sleeveKind = opts.protagonist && s===1 ? 'crimson' : 'cloth';
      mbox(b,sleeveKind, s*5.6, 11.0, 0, 2.6, 7.6, 2.6);
      mbox(b,'skin',  s*5.6,  6.6, 0, 2.4, 1.6, 2.4);
      for(let i=0;i<4;i++) mbox(b,armorKind, s*(5.9+i*0.18), 14.2-i*1.35, 0, 4.4, 1.15, 5.0+i*0.15);
      for(let i=0;i<4;i++) mbox(b,'gold', s*(5.9+i*0.18), 13.6-i*1.35, 0, 4.5, 0.22, 5.1+i*0.15);
      if(opts.protagonist && s===1){
        // gold armguard highlight
        mbox(b,'gold', s*5.6, 10.2, 0.8, 2.8, 0.4, 2.8);
      }
    });
    arms.push(arm);
  }
  const head=part(body,b=>{
    mbox(b,'skin', 0, 17.6, 0, 4.4, 4.2, 4.2);
    mbox(b,'dark', 0, 16.2, 0, 4.6, 1.4, 4.4);
    mbox(b,'steel',0, 16.0, 2.1, 3.2, 0.9, 0.5);
    mbox(b,'dark', 0, 17.9,-2.2, 4.2, 3.4, 0.6);
    mbox(b,armorKind, 0, 20.3, 0, 5.4, 2.8, 5.2);
    mbox(b,armorKind, 0, 22.0, 0, 4.2, 1.2, 4.0);
    mbox(b,'gold',    0, 22.9, 0, 1.4, 1.0, 1.4);
    for(let i=0;i<3;i++){
      mbox(b,'dark',    0, 19.3-i*1.05, -1.0-i*0.55, 6.0, 1.0, 4.6);
      mbox(b,armorKind, 0, 19.3-i*1.05,  0.0,        6.2-i*0.1, 1.0, 6.0+i*1.05);
    }
    for(const s of [-1,1]) mbox(b,'gold', s*3.0, 19.6, 1.6, 0.5, 2.6, 2.2);
    const crest=[[-2.6,24.0],[-1.9,25.1],[-1.0,25.9],[0,26.2],[1.0,25.9],[1.9,25.1],[2.6,24.0]];
    for(const [cx2,cy2] of crest) mbox(b, opts.protagonist?'gold':'gold', cx2, cy2, 0.2, 1.0, 1.0, 0.9);
    mbox(b,'gold', 0, 23.2, 0.2, 1.0, 1.4, 0.9);
    if(opts.protagonist){
      // crimson plume + larger crescent
      for(let y=24;y<28;y+=1) mbox(b,'crimson', 0, y, -2.0, 1.2, 1.0, 0.9);
      mbox(b,'gold', 0, 24.8, 1.2, 0.6, 2.6, 0.4);
      // sashimono flag on back
      // (drawn later as separate part for visibility)
    }
  });
  // sashimono banner for protagonist
  let sashimono=null;
  if(opts.protagonist){
    sashimono = part(body,b=>{
      mbox(b,'dark', 0, 13, -3.2, 0.3, 9, 0.3);
      for(let y=0;y<6;y++) for(let x=0;x<3;x++) mbox(b, y%2? 'crimson':'gold', x*1.05-1.05, 14+y*1.05, -3.2, 1.0,1.0,0.25);
      mbox(b,'gold', 0, 20.2, -3.2, 3.4,0.5,0.4);
    });
  }

  // sheathed Katana
  const katana = part(body,b=>{
    const a=-0.30;
    for(let i=0;i<11;i++){
      const t=i-4.5;
      mbox(b,'dark', -4.6 - t*Math.cos(a)*0.02, 8.6 + t*0.62, -1.2 - t*1.02, 1.35,1.0,1.25);
    }
    mbox(b,'steel',-4.6, 10.7, -5.1, 1.45,0.6,1.4);
    mbox(b,'gold', -4.6+0.1, 11.9, -7.2, 1.7,0.5,1.7);
    for(let i=0;i<4;i++) mbox(b,'cloth', -4.6, 12.4+i*0.62, -8.3-i*1.02, 1.15,1.0,1.15);
    mbox(b,'gold', -4.6, 15.0, -12.6, 1.3,0.7,1.3);
    mbox(b,'cloth', 0, 7.4, 0, 8.0, 1.5, 5.0);
    mbox(b,'gold',  0, 7.4, 2.6, 2.0, 1.2, 0.5);
  });

  // wielded sword for protagonist (visible when attacking)
  let wield=null, pickaxe=null, blockPreview=null;
  if(opts.protagonist){
    wield = new THREE.Group(); body.add(wield);
    // Initially katana in hand offset - will animate
    const wb = new Batcher();
    // blade
    for(let i=0;i<12;i++) wb.add('steel', 0, 0.5+i*0.95, 0, 0.35,1.0,0.35);
    wb.add('gold', 0, 0.2, 0, 1.2,0.5,1.2);
    wb.add('dark', 0, -0.6, 0, 0.9,1.6,0.9);
    wb.build(wield,{cast:true,receive:false});
    wield.position.set(1.4, 1.65, 0.9);
    wield.rotation.set(0,0, -Math.PI/2);
    wield.visible=false;
    // pickaxe
    pickaxe = new THREE.Group(); body.add(pickaxe);
    const pb=new Batcher();
    for(let i=0;i<8;i++) pb.add('wood', 0, i*0.9, 0, 0.45,1.0,0.45);
    for(let x=-2;x<=2;x++) pb.add('steel', x*0.5, 7.4, 0, 0.55,0.55,0.55);
    pb.add('steel', 0, 7.9, 0, 0.45,1.0,0.85);
    pb.build(pickaxe,{cast:true,receive:false});
    pickaxe.position.set(1.4,1.55,0.6);
    pickaxe.rotation.set(0,0,-0.2);
    pickaxe.visible=false;
    // block preview (ghost)
    const ggeo=new THREE.BoxGeometry(1,1,1);
    const gmat=new THREE.MeshLambertMaterial({color:0x8a6242, transparent:true, opacity:0.45});
    blockPreview=new THREE.Mesh(ggeo,gmat);
    blockPreview.visible=false;
    scene.add(blockPreview);
  }

  const rec={root,body,torso,head,arms,katana,phase:rnd(Math.PI*2),baseY:gy, isProtagonist:!!opts.protagonist, wield, pickaxe, blockPreview, sashimono, hp: opts.protagonist?100:30, dead:false};
  samurai.push(rec);
  return rec;
}

/* SHEEP */
const animals=[];
function buildSheep(x,z){
  const gy=terrainHeight(x,z);
  const root=new THREE.Group(); root.position.set(x,gy,z);
  root.rotation.y=rnd(Math.PI*2); root.scale.setScalar(1.0);
  worldGroup.add(root);
  const body=new THREE.Group(); root.add(body);
  part(body,b=>{
    for(let i=0;i<7;i++) for(let j=0;j<4;j++) for(let k=0;k<5;k++){
      if(RNG()<0.12) continue;
      mbox(b,'wool', (i-3)*1.55, 8.2+(j-1.5)*1.55, (k-2)*1.55, 1.9,1.9,1.9);
    }
    mbox(b,'wool', 0, 11.6, 0, 9.0, 2.0, 6.5);
  });
  const head=part(body,b=>{
    mbox(b,'dark', 6.6, 9.4, 0, 3.0,3.0,3.2);
    mbox(b,'wool', 5.4, 11.0, 0, 3.4,2.2,4.0);
    for(const s of [-1,1]) mbox(b,'dark', 6.0, 10.4, s*2.0, 1.4,1.0,1.6);
    mbox(b,'dark', 8.2, 8.6, 0, 1.0,1.0,1.8);
  });
  const legs=[];
  for(const sx of [-1,1]) for(const sz of [-1,1]){
    legs.push(part(body,b=>{
      mbox(b,'dark', sx*3.4, 3.0, sz*2.2, 1.5, 6.4, 1.5);
      mbox(b,'dark', sx*3.4, 0.3, sz*2.2, 1.8, 0.7, 1.8);
    }));
  }
  const a={type:'sheep',root,body,head,legs,phase:rnd(Math.PI*2),
    dir:rnd(Math.PI*2),speed:rnd(1.5,0.7),state:'walk',timer:rnd(6,2),baseY:gy, hp:12, dead:false};
  animals.push(a); return a;
}

/* ALPACA - fixed legs: forward axis is X so rotate around Z */
function buildAlpaca(x,z){
  const gy=terrainHeight(x,z);
  const root=new THREE.Group(); root.position.set(x,gy,z);
  root.rotation.y=rnd(Math.PI*2); root.scale.setScalar(1.12);
  worldGroup.add(root);
  const body=new THREE.Group(); root.add(body);
  const coat = RNG()<0.5?'alpaca':'wool';
  part(body,b=>{
    for(let i=0;i<6;i++) for(let j=0;j<4;j++) for(let k=0;k<4;k++){
      if(RNG()<0.1) continue;
      mbox(b,coat,(i-2.5)*1.6, 11.0+(j-1.5)*1.6, (k-1.5)*1.6, 1.95,1.95,1.95);
    }
    mbox(b,coat, -4.6, 12.4, 0, 2.2, 3.2, 3.2);
  });
  const neck=part(body,b=>{
    for(let i=0;i<7;i++) mbox(b,coat, 0, i*1.55, 0, 2.9, 1.75, 2.9);
    mbox(b,coat, 0.4, 11.4, 0, 3.6, 3.0, 3.2);
    mbox(b,'dark',2.2, 10.6, 0, 1.6, 1.6, 2.2);
    for(const s of [-1,1]){
      mbox(b,coat, -0.2, 13.6, s*1.1, 1.0, 2.6, 1.0);
      mbox(b,'dark',-0.2, 15.0, s*1.1, 0.8, 1.0, 0.8);
    }
    for(const s of [-1,1]) mbox(b,'dark', 1.9, 12.0, s*1.1, 0.7,0.7,0.7);
  },[4.2*M, 13.5*M, 0]);
  const legs=[];
  for(const sx of [-1,1]) for(const sz of [-1,1]){
    legs.push(part(body,b=>{
      mbox(b,sx>0?coat:coat, sx*3.2, 5.0, sz*2.0, 1.7, 10.0, 1.7);
      mbox(b,'dark', sx*3.2, 0.4, sz*2.0, 1.9, 0.9, 1.9);
    }));
  }
  const a={type:'alpaca',root,body,head:neck,neck,legs,phase:rnd(Math.PI*2),
    dir:rnd(Math.PI*2),speed:rnd(1.2,0.5),state:'walk',timer:rnd(6,2),baseY:gy, hp:14, dead:false};
  animals.push(a); return a;
}

/* BIRDS */
const birds=[];
function buildBird(cx,cy,cz,flockPhase){
  const root=new THREE.Group(); root.position.set(cx,cy,cz);
  scene.add(root);
  const bodyB=new Batcher();
  bodyB.add('dark',0,0,0, 0.55,0.42,0.95);
  bodyB.add('dark',0,0.08,0.62, 0.34,0.34,0.34);
  bodyB.add('gold',0,0.04,0.85, 0.16,0.14,0.2);
  bodyB.add('dark',0,0.02,-0.72,0.28,0.16,0.5);
  bodyB.build(root,{cast:false,receive:false});
  const wings=[];
  for(const s of [-1,1]){
    const w=new THREE.Group(); w.position.set(s*0.26,0.08,0); root.add(w);
    const wb=new Batcher();
    for(let i=1;i<=4;i++) wb.add('dark', s*i*0.34, 0, -0.04*i, 0.36,0.12,0.5-0.06*i);
    wb.build(w,{cast:false,receive:false});
    wings.push(w);
  }
  const b={root,wings,phase:rnd(Math.PI*2),flock:flockPhase,
    r:rnd(150,60), h:cy, sp:rnd(0.16,0.07), off:rnd(Math.PI*2), bob:rnd(4,1.5)};
  birds.push(b); return b;
}
function buildFlocks(){
  for(let f=0;f<5;f++){
    const fp=rnd(Math.PI*2), n=rndi(5,9), baseH=rnd(115,58);
    for(let i=0;i<n;i++) buildBird(0,baseH+rnd(14,-14),0,fp+i*0.22);
  }
}

/* CLOUDS */
const clouds=[];
function buildClouds(){
  for(let i=0;i<26;i++){
    const g=new THREE.Group();
    const cb=new Batcher();
    const w=rndi(5,11), d=rndi(4,8), s=rnd(9,5);
    for(let x=0;x<w;x++) for(let z=0;z<d;z++){
      const e=1.0-Math.hypot((x-w/2)/(w/2),(z-d/2)/(d/2));
      if(e<0.15) continue;
      const stack = e>0.6?2:1;
      for(let y=0;y<stack;y++)
        if(RNG()<0.86) cb.add('cloud', x*s, y*s*0.7, z*s, s*1.02, s*0.7, s*1.02);
    }
    cb.build(g,{cast:false,receive:false});
    const a=rnd(Math.PI*2), rr=rnd(560,140);
    g.position.set(Math.cos(a)*rr, rnd(210,132), Math.sin(a)*rr);
    scene.add(g);
    clouds.push({g,sp:rnd(2.6,0.9),drift:rnd(0.35,-0.35)});
  }
}

/* PETALS */
let petals=null; const petalData=[];
function buildPetals(){
  const N=520;
  const geo=new THREE.BufferGeometry();
  const pos=new Float32Array(N*3);
  for(let i=0;i<N;i++){
    const src = petalSources.length?pick(petalSources):{x:0,y:14,z:0,r:8};
    const d={ x:src.x+rnd(src.r,-src.r), y:src.y*rnd(1.0,0.25), z:src.z+rnd(src.r,-src.r),
      vy:rnd(2.6,1.1), sway:rnd(1.7,0.5), ph:rnd(Math.PI*2), src, ground:0 };
    d.ground = terrainHeight(d.x,d.z);
    petalData.push(d);
    pos[i*3]=d.x; pos[i*3+1]=d.y; pos[i*3+2]=d.z;
  }
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  petals=new THREE.Points(geo,new THREE.PointsMaterial({
    color:0xffc0da,size:0.62,sizeAttenuation:true,transparent:true,opacity:0.95,
    depthWrite:false}));
  petals.frustumCulled=false;
  scene.add(petals);
}

/* =======================================================================
   WORLD POPULATION
   ======================================================================= */
const GRAZE_R = 74;
const POND_CLEAR = 1.32;
let player=null;

function populateWorld(){
  const P=WORLD.pond;
  buildPagoda();
  buildTorii(WORLD.torii.x, WORLD.torii.z, 1.25, 0);
  buildTorii(-58, 62, 0.8, Math.PI*0.28);
  buildTorii( 58, 62, 0.8,-Math.PI*0.28);
  buildBridge();
  steppingPath(0, WORLD.torii.z-6, 0, P.z+P.rz+8, 22);
  steppingPath(0, P.z-P.rz-8, 0, WORLD.pagoda.z+13, 16);
  steppingPath(-34, 8, -12, WORLD.pagoda.z+6, 12);
  steppingPath( 34, 8,  12, WORLD.pagoda.z+6, 12);
  zenGarden(-40, -22, 26, 20);
  for(let i=0;i<9;i++){
    const t=i/8, z=lerp(WORLD.torii.z-10, P.z+P.rz+9, t);
    stoneLantern(-8.5, z, 1.0);
    stoneLantern( 8.5, z, 1.0);
  }
  for(const s of [-1,1]){
    stoneLantern(s*13, WORLD.pagoda.z+14, 1.15);
    stoneLantern(s*15, WORLD.pagoda.z-6, 1.0);
    stoneLantern(s*11, P.z-P.rz-9, 1.0);
  }
  stoneLantern(-30,-16,1.3); stoneLantern(-52,-30,1.1);
  bambooGrove(-56, 18, 17, 46);
  bambooGrove( 56, 18, 16, 42);
  bambooGrove(-46, -56, 15, 34);
  bambooGrove( 50, -50, 14, 30);
  sakuraTree(-26, 34, 1.15); sakuraTree( 27, 36, 1.0);
  sakuraTree(-34, 60, 0.95); sakuraTree( 33, 62, 1.1);
  sakuraTree(-20, 76, 0.9);  sakuraTree( 22, 78, 0.95);
  sakuraTree(-44, 12, 1.05); sakuraTree( 45, 10, 1.0);
  sakuraTree(-14, -4, 0.85); sakuraTree( 15, -6, 0.9);
  for(let i=0;i<48;i++){
    const a=rnd(Math.PI*2), rr=rnd(126,88);
    const x=Math.cos(a)*rr, z=Math.sin(a)*rr;
    if(terrainHeight(x,z)>40) continue;
    pineTree(x,z);
  }
  for(let i=0;i<70;i++){
    const a=rnd(Math.PI*2), rr=Math.sqrt(rnd(1))*80;
    const x=Math.cos(a)*rr, z=Math.sin(a)*rr;
    const pd=Math.hypot((x-P.x)/P.rx,(z-P.z)/P.rz);
    if(pd<1.3) continue;
    if(Math.abs(x)<10 && z>-20 && z<110) continue;
    if(Math.hypot(x-WORLD.pagoda.x, z-WORLD.pagoda.z)<16) continue;
    bush(x,z,rnd(1.4,0.65));
  }
  B.build(worldGroup,{cast:true,receive:true});

  // enemysamurai guardians (6 as before)
  buildSamurai(-9.5, WORLD.torii.z-3,  Math.PI);
  buildSamurai( 9.5, WORLD.torii.z-3,  Math.PI);
  buildSamurai(-12,  WORLD.pagoda.z+15, 0);
  buildSamurai( 12,  WORLD.pagoda.z+15, 0);
  buildSamurai(-6.5, P.z-P.rz-11, 0.25);
  buildSamurai( 6.5, P.z+P.rz+11, Math.PI-0.25);
  buildSamurai(-38, -20, -0.7);

  // PROTAGONIST — Crimson Ronin near the torii path, brighter colors
  const pSpawnX = 0, pSpawnZ = 68;
  player = buildSamurai(pSpawnX, pSpawnZ, -0.1, 'crimson', {protagonist:true, scale:1.18});
  // enhance protagonist details already done; add distinct helmet plume
  player.followDist = 14;
  player.yaw = -0.1;
  // expose globally for debug
  window._player = player;

  function meadowSpot(){
    for(let tries=0;tries<80;tries++){
      const a=rnd(Math.PI*2), rr=rnd(GRAZE_R-4,24);
      const x=Math.cos(a)*rr, z=Math.sin(a)*rr;
      if(Math.hypot((x-P.x)/P.rx,(z-P.z)/P.rz) < POND_CLEAR) continue;
      if(Math.abs(x)<9 && z>-24 && z<112) continue;
      if(Math.hypot(x-WORLD.pagoda.x, z-WORLD.pagoda.z) < 18) continue;
      if(terrainHeight(x,z) > 12) continue;
      return [x,z];
    }
    return [-46, -8];
  }
  for(let i=0;i<16;i++){ const [x,z]=meadowSpot(); buildSheep(x,z); }
  for(let i=0;i<9;i++){  const [x,z]=meadowSpot(); buildAlpaca(x,z); }

  buildFlocks();
  buildClouds();
  buildPetals();
  buildStars();
}

/* =======================================================================
   AUDIO
   ======================================================================= */
const Audio_={ ctx:null, on:false, master:null, windGain:null, chimeTimer:0 };
function initAudio(){
  if(Audio_.ctx) return;
  const AC = window.AudioContext||window.webkitAudioContext;
  const ctx = new AC();
  Audio_.ctx = ctx;
  const master = ctx.createGain();
  master.gain.value = 0.0;
  master.connect(ctx.destination);
  Audio_.master = master;
  const len = ctx.sampleRate*4;
  const buf = ctx.createBuffer(1,len,ctx.sampleRate);
  const dat = buf.getChannelData(0);
  let b0=0,b1=0,b2=0;
  for(let i=0;i<len;i++){
    const w=Math.random()*2-1;
    b0=0.99765*b0+w*0.0990460;
    b1=0.96300*b1+w*0.2965164;
    b2=0.57000*b2+w*1.0526913;
    dat[i]=(b0+b1+b2+w*0.1848)*0.16;
  }
  const noise=ctx.createBufferSource(); noise.buffer=buf; noise.loop=true;
  const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=420; lp.Q.value=0.6;
  const hp=ctx.createBiquadFilter(); hp.type='highpass';hp.frequency.value=90;
  const windGain=ctx.createGain(); windGain.gain.value=0.5;
  Audio_.windGain=windGain;
  noise.connect(hp); hp.connect(lp); lp.connect(windGain); windGain.connect(master);
  noise.start();
  const lfo=ctx.createOscillator(); lfo.frequency.value=0.045;
  const lfoG=ctx.createGain(); lfoG.gain.value=260;
  lfo.connect(lfoG); lfoG.connect(lp.frequency);
  const lfo2=ctx.createOscillator(); lfo2.frequency.value=0.077;
  const lfo2G=ctx.createGain(); lfo2G.gain.value=0.22;
  lfo2.connect(lfo2G); lfo2G.connect(windGain.gain);
  lfo.start(); lfo2.start();
  const drone=ctx.createOscillator(); drone.type='sine'; drone.frequency.value=58;
  const dg=ctx.createGain(); dg.gain.value=0.05;
  drone.connect(dg); dg.connect(master); drone.start();
}
const CHIME=[523.25,587.33,698.46,783.99,880.00,1046.50,1174.66];
function chime(){
  const ctx=Audio_.ctx; if(!ctx||!Audio_.on) return;
  const t=ctx.currentTime;
  const f=CHIME[Math.floor(Math.random()*CHIME.length)];
  const car=ctx.createOscillator(); car.type='sine'; car.frequency.value=f;
  const mod=ctx.createOscillator(); mod.type='sine'; mod.frequency.value=f*2.76;
  const modG=ctx.createGain(); modG.gain.value=f*1.4;
  mod.connect(modG); modG.connect(car.frequency);
  const g=ctx.createGain(); g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(0.16,t+0.012);
  g.gain.exponentialRampToValueAtTime(0.0001,t+3.6);
  const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=f*1.4; bp.Q.value=2.2;
  car.connect(g); g.connect(bp); bp.connect(Audio_.master);
  car.start(t); mod.start(t); car.stop(t+3.8); mod.stop(t+3.8);
}
function toggleAudio(){
  initAudio();
  const ctx=Audio_.ctx;
  if(ctx.state==='suspended') ctx.resume();
  Audio_.on=!Audio_.on;
  const t=ctx.currentTime;
  Audio_.master.gain.cancelScheduledValues(t);
  Audio_.master.gain.setValueAtTime(Audio_.master.gain.value,t);
  Audio_.master.gain.linearRampToValueAtTime(Audio_.on?0.32:0.0, t+0.9);
  const btn=document.getElementById('btn-audio');
  if(btn){ btn.textContent = Audio_.on?'🔊 Sound':'🔇 Sound'; btn.classList.toggle('on',Audio_.on); }
}

/* =======================================================================
   CAMERA PRESETS + PLAYER FOLLOW
   ======================================================================= */
function groundCam(x,above,z){ return [x, terrainHeight(x,z)+above, z]; }
const CAMS={
  pagoda:{ pos:groundCam(0,30,52),      tgt:[0,20,WORLD.pagoda.z],  name:'Pagoda Front' },
  samurai:{pos:groundCam(-13.5,4.6,WORLD.torii.z+9),
           tgt:[-9.5, terrainHeight(-9.5,WORLD.torii.z-3)+3.4, WORLD.torii.z-3], name:'Samurai Closeup' },
  meadow:{ pos:groundCam(-52,14,26),    tgt:[-6,4,10],              name:'Pastoral Meadow' },
  vista:{  pos:groundCam(128,46,196),   tgt:[0,34,-24],             name:'Mountain Vista' },
  bird:{   pos:groundCam(10,165,150),   tgt:[0,8,10],               name:"Bird's Eye" },
  third:{  pos:[0,8,14], tgt:[0,2,0], name:'Ronin Follow' }
};
const camTween={active:false,t:0,dur:1.7,
  p0:new THREE.Vector3(),p1:new THREE.Vector3(),
  t0:new THREE.Vector3(),t1:new THREE.Vector3()};
function gotoCam(key){
  if(key==='third' && player){ startFollowCam(); return; }
  const c=CAMS[key]; if(!c) return;
  camTween.p0.copy(camera.position);
  camTween.t0.copy(controls.target);
  camTween.p1.set(...c.pos);
  camTween.t1.set(...c.tgt);
  camTween.t=0; camTween.active=true;
  document.querySelectorAll('.cbtn').forEach(b=>b.classList.toggle('on',b.dataset.cam===key));
}
function updateCamTween(dt){
  if(!camTween.active) return;
  camTween.t=Math.min(1,camTween.t+dt/camTween.dur);
  const e = camTween.t<0.5 ? 4*camTween.t**3 : 1-Math.pow(-2*camTween.t+2,3)/2;
  camera.position.lerpVectors(camTween.p0,camTween.p1,e);
  controls.target.lerpVectors(camTween.t0,camTween.t1,e);
  if(camTween.t>=1) camTween.active=false;
}
let followMode=true;
function startFollowCam(){
  followMode=true;
  document.getElementById('btn-follow')?.classList.add('on');
  document.querySelectorAll('.cbtn').forEach(b=>b.classList.toggle('on', b.dataset.cam==='third'));
  camTween.active=false;
}
function stopFollowCam(){
  followMode=false;
  document.getElementById('btn-follow')?.classList.remove('on');
}

/* =======================================================================
   INPUT + PLAYER CONTROLLER
   ======================================================================= */
const Keys={};
addEventListener('keydown',e=>{
  Keys[e.code]=true;
  if(['Space','ArrowUp','ArrowDown'].includes(e.code)) e.preventDefault();
  if(e.code==='Digit1') setTool(0);
  if(e.code==='Digit2') setTool(1);
  if(e.code==='Digit3') setTool(2);
  if(e.code==='KeyQ') cycleTool();
});
addEventListener('keyup',e=>Keys[e.code]=false);

let toolIndex=0; // 0 katana, 1 pickaxe, 2 build
const TOOLS=['Katana','Pickaxe','Blocks'];
function setTool(i){
  toolIndex = ((i%3)+3)%3;
  document.querySelectorAll('.hot-slot').forEach((el,idx)=> el.classList.toggle('on', idx===toolIndex));
  document.getElementById('s-tool').textContent = TOOLS[toolIndex];
  if(player){
    player.wield.visible = toolIndex===0;
    player.pickaxe.visible = toolIndex===1;
    player.blockPreview.visible = toolIndex===2 && !!hoverVoxel;
  }
  showHudMsg('Tool: '+TOOLS[toolIndex]);
}
function cycleTool(){ setTool(toolIndex+1); }

function showHudMsg(msg, dur=1200){
  const el=document.getElementById('hud-msg');
  if(!el) return;
  el.textContent=msg; el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t=setTimeout(()=>el.classList.add('hidden'), dur);
}

// Player physics
const playerState={
  vy:0,
  onGround:true,
  isCrawling:false,
  isRunning:false,
  hp:100,
  hunger:100,
  attackCooldown:0,
  mineCooldown:0,
  yaw:0,
  pitch:-0.15
};

const RAY = new THREE.Raycaster();
const MOUSE = new THREE.Vector2(0,0);
let hoverVoxel=null; // {pos, normal, placePos}
const placedVoxels=[]; // {mesh, x,y,z}
let mouseDownLeft=false, mouseDownRight=false;

function getForwardDir(){
  // camera forward projected onto ground plane
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  fwd.y=0; fwd.normalize();
  return fwd;
}
function getRightDir(){
  const fwd=getForwardDir();
  return new THREE.Vector3(fwd.z,0,-fwd.x);
}

function updatePlayer(dt,t){
  if(!player || player.dead) return;
  const speedWalk=6.5, speedRun=11.5, speedCrawl=2.8;
  const accel=28;
  const gravity=-28;

  // inputs
  const forward = (Keys['KeyW']||Keys['ArrowUp']?1:0) + (Keys['KeyS']||Keys['ArrowDown']?-1:0);
  const strafe  = (Keys['KeyA']? -1:0) + (Keys['KeyD']? 1:0);
  const wantRun = !!Keys['ShiftLeft']||!!Keys['ShiftRight'];
  const wantCrawl = !!Keys['ControlLeft']||!!Keys['ControlRight']||!!Keys['KeyC'];
  const wantJump = !!Keys['Space'];

  playerState.isCrawling = wantCrawl;
  playerState.isRunning = wantRun && !wantCrawl && forward>0;

  let inputDir=new THREE.Vector3();
  if(forward||strafe){
    const fwd=getForwardDir();
    const right=getRightDir();
    inputDir.addScaledVector(fwd, forward);
    inputDir.addScaledVector(right, strafe);
    if(inputDir.lengthSq()>0) inputDir.normalize();
  }

  let targetSpeed=0;
  if(inputDir.lengthSq()>0){
    if(playerState.isCrawling) targetSpeed=speedCrawl;
    else if(playerState.isRunning) targetSpeed=speedRun;
    else targetSpeed=speedWalk;
  }

  // movement with simple accel
  if(!player._vel) player._vel=new THREE.Vector3();
  const desiredVel = inputDir.clone().multiplyScalar(targetSpeed);
  // lerp velocity
  player._vel.lerp(desiredVel, clamp(dt*accel/targetSpeed||10,0,1));
  if(inputDir.lengthSq()===0) player._vel.lerp(new THREE.Vector3(), dt*10);

  const move = player._vel.clone().multiplyScalar(dt);
  // attempt move with collision (heightfield + simple radius)
  let nx = player.root.position.x + move.x;
  let nz = player.root.position.z + move.z;
  // keep inside world bounds
  nx=clamp(nx, -WORLD.half+4, WORLD.half-4);
  nz=clamp(nz, -WORLD.half+4, WORLD.half-4);
  // pond avoidance? allow wading but slower
  const P=WORLD.pond;
  const pd=Math.hypot((nx-P.x)/P.rx,(nz-P.z)/P.rz);
  if(pd<1.02){
    // shallow water: reduce speed
    player._vel.multiplyScalar(0.6);
  }

  player.root.position.x = nx;
  player.root.position.z = nz;

  // vertical: gravity + terrain snap
  const groundY = terrainHeight(nx,nz);
  if(playerState.onGround && wantJump){
    playerState.vy = 10.5;
    playerState.onGround=false;
  }
  if(!playerState.onGround){
    playerState.vy += gravity*dt;
    player.root.position.y += playerState.vy*dt;
    if(player.root.position.y <= groundY){
      player.root.position.y = groundY;
      playerState.vy=0;
      playerState.onGround=true;
    }
  } else {
    player.root.position.y = groundY;
    // step up small bumps
    if(playerState.vy<0) playerState.vy=0;
  }

  // yaw facing movement or camera facing
  if(inputDir.lengthSq()>0){
    const targetYaw = Math.atan2(inputDir.x, inputDir.z);
    // smooth rotate
    let diff = targetYaw - player.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    player.yaw += diff * clamp(dt*8,0,1);
    player.root.rotation.y = player.yaw;
  } else if(followMode){
    // face camera direction when idle in follow mode
    // keep last yaw
  }

  // animation
  const moving = inputDir.lengthSq()>0.001;
  const isAir = !playerState.onGround;
  const time = t;
  // breathing baseline
  const breath = Math.sin(time*1.15)*0.055;
  player.body.position.y = breath + (isAir? Math.sin(time*12)*0.02 : 0);
  // scale crawling
  if(playerState.isCrawling){
    player.body.scale.set(1,0.62,1);
    player.body.position.y -= 0.35;
  } else {
    player.body.scale.lerp(new THREE.Vector3(1,1,1), dt*8);
  }
  // leg swing: correct axis is Z (forward is X). For protagonist, legs along?
  // Our micro voxel legs are oriented same as animals: forward = X, so rotate Z.
  // But samurai legs: model has legs at +/- X? Let's animate with simple bob + arm swing
  const swing = moving ? Math.sin(time*(playerState.isRunning?9.2:6.2))*0.42 : 0;
  // For samurai, approximate: arms swing Z? original used rotation.x for arms.
  // Keep similar but add protagonist run
  if(!isAir){
    player.arms[0].rotation.x = swing*0.6;
    player.arms[1].rotation.x = -swing*0.6;
  } else {
    player.arms[0].rotation.x = lerp(player.arms[0].rotation.x, -0.4, dt*6);
    player.arms[1].rotation.x = lerp(player.arms[1].rotation.x, 0.4, dt*6);
  }
  // weapon bob
  if(player.wield){
    if(toolIndex===0){
      const atk = player._attackT||0;
      if(atk>0){
        player.wield.rotation.z = lerp(player.wield.rotation.z, -2.1, dt*18);
        player.wield.rotation.x = Math.sin(atk*14)*0.5;
      } else if(moving){
        player.wield.rotation.z = -1.57 + Math.sin(time*(playerState.isRunning?9:6))*0.18;
      } else {
        player.wield.rotation.z = lerp(player.wield.rotation.z, -1.57, dt*6);
      }
    }
  }
  if(player.pickaxe && toolIndex===1){
    const mine = player._mineT||0;
    if(mine>0) player.pickaxe.rotation.z = -0.2 + Math.sin(mine*18)*1.2;
    else if(moving) player.pickaxe.rotation.z = -0.2 + Math.sin(time*6)*0.15;
  }

  // cooldowns
  if(playerState.attackCooldown>0) playerState.attackCooldown-=dt;
  if(playerState.mineCooldown>0) playerState.mineCooldown-=dt;
  if(player._attackT) player._attackT-=dt;
  if(player._attackT!==undefined && player._attackT<=0) player._attackT=0;
  if(player._mineT) player._mineT-=dt;
  if(player._mineT!==undefined && player._mineT<=0) player._mineT=0;

  // UI
  const hpEl=document.getElementById('s-hp');
  if(hpEl) hpEl.textContent = Math.round(playerState.hp);

  // building preview update
  updateHoverVoxel();
}

/* Combat & Building */
function tryAttack(){
  if(!player || player.dead) return;
  if(playerState.attackCooldown>0) return;
  if(toolIndex!==0) return; // only katana attacks
  playerState.attackCooldown=0.45;
  player._attackT=0.45;
  const origin=player.root.position.clone(); origin.y+=1.2;
  const range=3.8;
  let hit=null, best=Infinity;
  const checkList=[...animals, ...samurai.filter(s=>!s.isProtagonist && !s.dead)];
  for(const e of checkList){
    if(e.dead) continue;
    const p=e.root?e.root.position:e.position;
    const d=origin.distanceTo(p);
    if(d<range && d<best){
      // dot product front check
      const to=new THREE.Vector3().subVectors(p, origin).normalize();
      const fwd=new THREE.Vector3(Math.sin(player.yaw),0, Math.cos(player.yaw));
      if(fwd.dot(to) > 0.0 || d<2.2){
        best=d; hit=e;
      }
    }
  }
  if(hit){
    hit.hp = (hit.hp||10)- (toolIndex===0?18:8);
    // knockback
    const dir=new THREE.Vector3().subVectors(hit.root.position, origin).normalize();
    hit.root.position.addScaledVector(dir, 1.1);
    hit.root.position.y = terrainHeight(hit.root.position.x, hit.root.position.z);
    // flash?
    hit.root.traverse(o=>{ if(o.isMesh) {o.material=cycleFlashMaterial(o.material);} });
    setTimeout(()=>{ /* restore */ },120);
    if(hit.hp<=0){
      killEntity(hit);
      if(hit.type==='sheep'||hit.type==='alpaca'){
        playerState.hunger = Math.min(100, playerState.hunger+22);
        showHudMsg('Ate meat +22 hunger');
        playerState.hp = Math.min(100, playerState.hp+6);
      } else {
        showHudMsg('Defeated samurai!');
      }
    } else {
      showHudMsg(hit.type? `Hit ${hit.type} HP ${hit.hp}`: `Hit samurai HP ${hit.hp}`);
    }
    // chime feedback
    if(Audio_.on) chime();
  } else {
    showHudMsg('Swish!');
  }
}
function cycleFlashMaterial(mat){
  const orig=mat.color?mat.color.getHex():null;
  if(mat.color) mat.color.setHex(0xffffff);
  setTimeout(()=>{ if(orig!==null && mat.color) mat.color.setHex(orig); },100);
  return mat;
}
function killEntity(ent){
  ent.dead=true;
  // fade out
  ent.root.traverse(o=>{ if(o.material) {o.material.transparent=true; o.material.opacity=0.0;}});
  // hide after delay and remove from arrays? Keep but not update
  // simple drop: scale down
  const start=performance.now();
  const duration=600;
  const tickFade=()=>{
    const e=(performance.now()-start)/duration;
    if(e>=1){ ent.root.visible=false; return;}
    ent.root.scale.setScalar(1 - e*0.9);
    ent.root.position.y = ent.baseY !==undefined ? ent.baseY - e*1.5 : ent.root.position.y - 0.02;
    requestAnimationFrame(tickFade);
  };
  tickFade();
  if(ent.type){
    const idx=animals.indexOf(ent);
    if(idx>=0) animals.splice(idx,1);
  } else {
    // samurai enemy: keep but dead
  }
}

/* Voxel building/mining - simple free-floating cubes */
const VOXEL_SIZE=1.0;
function getIntersectPlaneY(y=0){
  // ray from camera center
  RAY.setFromCamera(new THREE.Vector2(0,0), camera);
  const plane=new THREE.Plane(new THREE.Vector3(0,1,0), -y);
  const pt=new THREE.Vector3();
  RAY.ray.intersectPlane(plane, pt);
  return pt;
}
function updateHoverVoxel(){
  if(!player) return;
  if(toolIndex!==1 && toolIndex!==2){
    if(player.blockPreview) player.blockPreview.visible=false;
    hoverVoxel=null;
    return;
  }
  RAY.setFromCamera(new THREE.Vector2(0,0), camera);
  // intersect terrain approximated + placed voxels + world
  const candidates=[];
  // terrain: sample groundY at ray intersection with plane at player ground
  // Use raycast against placed voxels first
  const voxelMeshes=placedVoxels.map(v=>v.mesh);
  const hits=RAY.intersectObjects(voxelMeshes, false);
  if(hits.length){
    const h=hits[0];
    hoverVoxel={ pos:h.point.clone(), normal:h.face.normal.clone(), object:h.object,
      placePos: h.point.clone().add(h.face.normal.clone().multiplyScalar(0.6)),
      isVoxel:true, hit:h };
    // transform placePos to grid
    hoverVoxel.placePos.set(
      Math.round(hoverVoxel.placePos.x/VOXEL_SIZE)*VOXEL_SIZE,
      Math.round(hoverVoxel.placePos.y/VOXEL_SIZE)*VOXEL_SIZE,
      Math.round(hoverVoxel.placePos.z/VOXEL_SIZE)*VOXEL_SIZE
    );
    hoverVoxel.pos.set(
      Math.round(h.object.position.x),
      Math.round(h.object.position.y),
      Math.round(h.object.position.z)
    );
  } else {
    // ground plane hover
    const groundY=terrainHeight(player.root.position.x, player.root.position.z);
    const pt=getIntersectPlaneY(groundY+0.6);
    const camDist=pt.distanceTo(camera.position);
    if(camDist>12){
      hoverVoxel=null;
      if(player.blockPreview) player.blockPreview.visible=false;
      return;
    }
    hoverVoxel={
      pos: new THREE.Vector3(Math.round(pt.x), Math.round(groundY+0.6), Math.round(pt.z)),
      placePos: new THREE.Vector3(Math.round(pt.x), Math.round(groundY+0.6), Math.round(pt.z)),
      normal: new THREE.Vector3(0,1,0),
      isVoxel:false
    };
  }
  if(player.blockPreview){
    if(toolIndex===2 && hoverVoxel){
      player.blockPreview.visible=true;
      player.blockPreview.position.copy(hoverVoxel.placePos);
    } else {
      player.blockPreview.visible=false;
    }
  }
}
function tryMine(){
  if(toolIndex!==1) return;
  if(playerState.mineCooldown>0) return;
  playerState.mineCooldown=0.28;
  player._mineT=0.28;
  if(!hoverVoxel || !hoverVoxel.isVoxel) {
    // try to mine terrain? For simplicity, dig a hole by removing ground cap? Not implemented.
    showHudMsg('Aim at a placed block');
    return;
  }
  const mesh=hoverVoxel.object;
  const idx=placedVoxels.findIndex(v=>v.mesh===mesh);
  if(idx>=0){
    scene.remove(mesh);
    worldGroup.remove(mesh);
    placedVoxels.splice(idx,1);
    showHudMsg('Mined block');
    if(Audio_.on) chime();
  }
}
function tryBuild(){
  if(toolIndex!==2) return;
  if(playerState.mineCooldown>0) return;
  playerState.mineCooldown=0.32;
  if(!hoverVoxel) return;
  const pos=hoverVoxel.placePos.clone();
  // avoid building inside player
  if(pos.distanceTo(player.root.position)<1.4) return;
  // avoid building inside existing voxel
  for(const v of placedVoxels){
    if(v.mesh.position.distanceTo(pos)<0.6) return;
  }
  const geo=new THREE.BoxGeometry(VOXEL_SIZE,VOXEL_SIZE,VOXEL_SIZE);
  const mat=new THREE.MeshLambertMaterial({map: TEX_CACHE['plank'] || MAT.plank?.map, color:0xffffff});
  // Use a random material variant
  const kinds=['plank','stone','woodMid'];
  const kind=pick(kinds);
  const m=new THREE.Mesh(geo, MAT[kind] || mat);
  m.position.copy(pos);
  m.castShadow=true; m.receiveShadow=true;
  scene.add(m); worldGroup.add(m);
  placedVoxels.push({mesh:m, x:pos.x,y:pos.y,z:pos.z, kind});
  showHudMsg('Placed '+kind);
}

/* Mouse handling */
renderer.domElement.addEventListener('mousedown',e=>{
  if(e.button===0) {mouseDownLeft=true; if(toolIndex===0) tryAttack(); else if(toolIndex===1) tryMine(); }
  if(e.button===2) {mouseDownRight=true; if(toolIndex===2) tryBuild(); }
});
renderer.domElement.addEventListener('mouseup',e=>{
  if(e.button===0) mouseDownLeft=false;
  if(e.button===2) mouseDownRight=false;
});
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('keydown',e=>{
  if(e.code==='KeyE'){ followMode=!followMode; document.getElementById('btn-follow')?.classList.toggle('on',followMode); showHudMsg(followMode?'Follow cam ON':'Free cam'); }
});

/* =======================================================================
   UI WIRING
   ======================================================================= */
function wireUI(){
  document.querySelectorAll('.tbtn').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('.tbtn').forEach(o=>o.classList.remove('on'));
    b.classList.add('on'); applyTime(b.dataset.time);
    if(Audio_.on) chime();
  }));
  document.querySelectorAll('.cbtn').forEach(b=>b.addEventListener('click',()=>gotoCam(b.dataset.cam)));
  const audioBtn=document.getElementById('btn-audio');
  if(audioBtn) audioBtn.addEventListener('click',toggleAudio);
  const orbitBtn=document.getElementById('btn-orbit');
  if(orbitBtn) orbitBtn.addEventListener('click',()=>{
    controls.autoRotate=!controls.autoRotate;
    orbitBtn.classList.toggle('on',controls.autoRotate);
  });
  const followBtn=document.getElementById('btn-follow');
  if(followBtn) followBtn.addEventListener('click',()=>{
    followMode=!followMode;
    followBtn.classList.toggle('on',followMode);
    showHudMsg(followMode?'Follow ON':'Follow OFF');
  });
  const ui=document.getElementById('ui'), tog=document.getElementById('ui-toggle');
  const hideBtn=document.getElementById('btn-hide');
  if(hideBtn) hideBtn.addEventListener('click',()=>{
    ui.classList.add('fadeout'); tog.classList.remove('hidden');
  });
  if(tog) tog.addEventListener('click',()=>{
    ui.classList.remove('fadeout'); tog.classList.add('hidden');
  });
  addEventListener('keydown',e=>{
    const k=e.key;
    if(k==='1') document.querySelector('[data-time="morning"]')?.click();
    if(k==='2') document.querySelector('[data-time="sunset"]')?.click();
    if(k==='3') document.querySelector('[data-time="night"]')?.click();
    if(k==='4') gotoCam('pagoda');
    if(k==='5') gotoCam('samurai');
    if(k==='6') gotoCam('meadow');
    if(k==='7') gotoCam('vista');
    if(k==='8') gotoCam('bird');
    if(k.toLowerCase()==='m') toggleAudio();
    if(k.toLowerCase()==='r'){ controls.autoRotate=!controls.autoRotate;
      document.getElementById('btn-orbit')?.classList.toggle('on',controls.autoRotate); }
  });
  addEventListener('resize',()=>{
    camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth,innerHeight);
  });
  // hotbar clicks
  document.querySelectorAll('.hot-slot').forEach(el=>{
    el.addEventListener('click',()=> setTool(parseInt(el.dataset.slot)) );
  });
}

/* =======================================================================
   ANIMATION
   ======================================================================= */
const clock=new THREE.Clock();
let fpsAcc=0, fpsFrames=0, fpsTimer=0;

function animateActors(t,dt){
  // samurai NPCs: idle breathing + slow head scan (skip dead)
  for(const s of samurai){
    if(s.dead) continue;
    if(s.isProtagonist) continue; // protagonist handled separately
    const b=Math.sin(t*1.15+s.phase);
    s.body.position.y = b*0.055;
    s.torso.scale.set(1+b*0.014, 1-b*0.012, 1+b*0.014);
    s.head.rotation.y = Math.sin(t*0.34+s.phase)*0.30;
    s.head.position.y = b*0.03;
    s.arms[0].rotation.x =  b*0.045;
    s.arms[1].rotation.x = -b*0.045;
    // simple enemy AI: chase player if close
    if(player && !player.dead){
      const dist=s.root.position.distanceTo(player.root.position);
      if(dist<18 && dist>2.2){
        const dir=Math.atan2(player.root.position.x - s.root.position.x, player.root.position.z - s.root.position.z);
        s.root.rotation.y = dir - Math.PI/2;
        const sp=2.2*dt;
        s.root.position.x += Math.sin(dir)*sp;
        s.root.position.z += Math.cos(dir)*sp;
        s.root.position.y = terrainHeight(s.root.position.x, s.root.position.z);
        // walking anim for enemies
        const st=Math.sin(t*6.8);
        // For samurai, legs not explicitly separated; but body bob
        s.body.position.y += Math.abs(st)*0.06;
      } else if(dist<=2.4 && t%1.2<0.05){
        // attack player occasionally
        playerState.hp-=1;
        showHudMsg('Hit by samurai! HP '+Math.round(playerState.hp));
        // knockback
        const dir=new THREE.Vector3().subVectors(player.root.position, s.root.position).normalize();
        player.root.position.addScaledVector(dir, 0.8);
        if(playerState.hp<=0){
          player.dead=true;
          showHudMsg('You were defeated! Refresh to restart');
        }
      }
    }
  }

  // animals: wander + graze — FIXED forward axis rotation (Z not X)
  for(const a of animals){
    if(a.dead) continue;
    a.timer-=dt;
    if(a.timer<=0){
      if(a.state==='walk'){ a.state='graze'; a.timer=rnd(6.5,2.5); }
      else { a.state='walk'; a.timer=rnd(7,3); a.dir+=rnd(1.4,-1.4); }
    }
    // flee from player if too close
    if(player && !player.dead){
      const d=a.root.position.distanceTo(player.root.position);
      if(d<8 && a.state!=='flee'){
        a.state='walk';
        a.dir = Math.atan2(a.root.position.x - player.root.position.x, a.root.position.z - player.root.position.z);
        a.timer=3;
        a.speed=2.4;
      }
    }
    if(a.state==='walk'){
      const sp=a.speed*dt;
      const P=WORLD.pond;
      const cx=a.root.position.x, cz=a.root.position.z;
      const nx=cx+Math.sin(a.dir)*sp, nz=cz+Math.cos(a.dir)*sp;
      const rr=Math.hypot(nx,nz);
      const pd=Math.hypot((nx-P.x)/P.rx,(nz-P.z)/P.rz);
      if(rr>GRAZE_R){
        a.dir = Math.atan2(-cx,-cz) + rnd(0.5,-0.5);
      } else if(pd<POND_CLEAR){
        a.dir = Math.atan2(cx-P.x, cz-P.z) + rnd(0.5,-0.5);
      } else {
        a.root.position.x=nx; a.root.position.z=nz;
      }
      a.root.position.y = terrainHeight(a.root.position.x,a.root.position.z);
      a.root.rotation.y = a.dir - Math.PI/2;
      // FIXED: rotate around Z (forward = X) not X, so legs swing forward/back
      const st=Math.sin(t*6.2+a.phase);
      a.legs[0].rotation.z =  st*0.5;  a.legs[3].rotation.z =  st*0.5;
      a.legs[1].rotation.z = -st*0.5;  a.legs[2].rotation.z = -st*0.5;
      a.body.position.y = Math.abs(Math.sin(t*6.2+a.phase))*0.06;
      if(a.type==='alpaca') a.neck.rotation.z = lerp(a.neck.rotation.z, -0.12, dt*3);
      else a.head.rotation.z = lerp(a.head.rotation.z, 0, dt*3);
    } else {
      const bob=Math.sin(t*2.3+a.phase)*0.12;
      for(const L of a.legs) L.rotation.z = lerp(L.rotation.z,0,dt*4);
      if(a.type==='alpaca') a.neck.rotation.z = lerp(a.neck.rotation.z, 1.15+bob*0.35, dt*2.4);
      else a.head.rotation.z = lerp(a.head.rotation.z, 0.55+bob*0.3, dt*2.4);
      a.body.position.y = lerp(a.body.position.y, bob*0.05, dt*3);
    }
  }

  for(const b of birds){
    const ang = t*b.sp + b.off + b.flock;
    const x=Math.cos(ang)*b.r, z=Math.sin(ang)*b.r;
    const y=b.h + Math.sin(t*0.6+b.off)*b.bob;
    b.root.position.set(x,y,z);
    b.root.rotation.y = -ang + Math.PI/2;
    b.root.rotation.z = Math.sin(t*0.6+b.off)*0.16;
    const flap=Math.sin(t*8.4+b.phase);
    b.wings[0].rotation.z = -flap*0.85;
    b.wings[1].rotation.z =  flap*0.85;
  }
  for(const c of clouds){
    c.g.position.x += c.sp*dt*2.2;
    c.g.position.z += c.drift*dt*2.2;
    if(c.g.position.x>760){ c.g.position.x=-760; c.g.position.z=rnd(600,-600); }
  }
  if(petals){
    const arr=petals.geometry.attributes.position.array;
    for(let i=0;i<petalData.length;i++){
      const d=petalData[i];
      d.y -= d.vy*dt;
      const px=d.x+Math.sin(t*d.sway+d.ph)*1.5;
      const pz=d.z+Math.cos(t*d.sway*0.8+d.ph)*1.5;
      if(d.y<d.ground+0.2){
        d.x=d.src.x+rnd(d.src.r,-d.src.r);
        d.z=d.src.z+rnd(d.src.r,-d.src.r);
        d.y=d.src.y+rnd(4,0);
        d.ground=terrainHeight(d.x,d.z);
      }
      arr[i*3]=px; arr[i*3+1]=d.y; arr[i*3+2]=pz;
    }
    petals.geometry.attributes.position.needsUpdate=true;
  }
  if(waterMesh){
    waterMesh.position.y = Math.sin(t*0.9)*0.07;
    if(waterMesh.material.map){
      waterMesh.material.map.offset.x = Math.sin(t*0.09)*0.06;
      waterMesh.material.map.offset.y = t*0.011;
    }
  }
  if(TIME_PRESETS[currentTime].lantern>0.01){
    for(let i=0;i<lanternLights.length;i++){
      const L=lanternLights[i];
      const f=0.86+0.14*Math.sin(t*(5.5+i%5)+i*1.7)+0.05*Math.sin(t*17.3+i);
      L.light.intensity = L.base*TIME_PRESETS[currentTime].lantern*f;
    }
  }
  // player update
  updatePlayer(dt,t);
  // follow camera
  if(followMode && player && !camTween.active){
    const targetPos=player.root.position.clone();
    targetPos.y+= playerState.isCrawling?1.2:2.8;
    // camera offset behind player (relative to yaw)
    const dist = playerState.isCrawling? 9 : (playerState.isRunning? 11 : 13);
    const height = playerState.isCrawling? 3.2 : 5.5;
    const yaw = player.yaw;
    const camX = targetPos.x - Math.sin(yaw)*dist;
    const camZ = targetPos.z - Math.cos(yaw)*dist;
    const camY = targetPos.y + height;
    const desired = new THREE.Vector3(camX, camY, camZ);
    camera.position.lerp(desired, clamp(dt*3.2,0,1));
    controls.target.lerp(targetPos, clamp(dt*4.5,0,1));
  }
}

function tick(){
  requestAnimationFrame(tick);
  const dt=Math.min(clock.getDelta(),0.05);
  const t=clock.elapsedTime;

  animateActors(t,dt);
  updateCamTween(dt);
  controls.update();
  skyDome.position.copy(camera.position);
  if(starField) starField.position.copy(camera.position);
  if(Audio_.on){
    Audio_.chimeTimer-=dt;
    if(Audio_.chimeTimer<=0){ chime(); Audio_.chimeTimer=rnd(9,2.5); }
  }
  renderer.render(scene,camera);
  fpsFrames++; fpsAcc+=dt; fpsTimer+=dt;
  if(fpsTimer>0.5){
    const fpsEl=document.getElementById('s-fps');
    if(fpsEl) fpsEl.textContent=Math.round(fpsFrames/fpsAcc);
    const drawEl=document.getElementById('s-draw');
    if(drawEl) drawEl.textContent=renderer.info.render.calls;
    fpsFrames=0; fpsAcc=0; fpsTimer=0;
  }
}

/* BOOT */
function setMsg(m){ const e=document.getElementById('loader-msg'); if(e) e.textContent=m; }
function boot(){
  setMsg('PAINTING TEXTURES…');
  buildTextures(); buildMaterials();
  // fix celestial material after buildMaterials (needs MAT)
  celestial.material = MAT.sun;
  requestAnimationFrame(()=>{
    setMsg('RAISING MOUNTAINS…');
    buildTerrain(); buildWater();
    requestAnimationFrame(()=>{
      setMsg('BUILDING THE SANCTUARY…');
      populateWorld();
      requestAnimationFrame(()=>{
        setMsg('LIGHTING LANTERNS…');
        applyTime('morning',true);
        gotoCam('pagoda');
        camera.position.set(...CAMS.pagoda.pos);
        controls.target.set(...CAMS.pagoda.tgt);
        camTween.active=false;
        wireUI();
        setTool(0);
        // start in follow mode after short delay
        setTimeout(()=>{ startFollowCam(); }, 1600);
        document.getElementById('s-vox').textContent=VOXEL_COUNT.toLocaleString();
        const l=document.getElementById('loader');
        if(l){ l.classList.add('fadeout'); setTimeout(()=>l.remove(),650); }
        // initial hover
        updateHoverVoxel();
        tick();
      });
    });
  });
}
boot();

// Export for module usage (vite HMR)
export { terrainHeight, player, samurai, animals };
