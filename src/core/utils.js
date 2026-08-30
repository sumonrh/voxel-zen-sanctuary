export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

export const RNG = mulberry32(20260818);
export const rnd  = (a=1,b=0)=>b+(a-b)*RNG();
export const rndi = (a,b)=>Math.floor(rnd(b+1,a));
export const pick = arr=>arr[Math.floor(RNG()*arr.length)];
export const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export const lerp =(a,b,t)=>a+(b-a)*t;
export const smooth=t=>t*t*(3-2*t);

export function hash2(x,y){let h=Math.sin(x*127.1+y*311.7)*43758.5453123;return h-Math.floor(h);}
export function vnoise(x,y){
  const xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi;
  const u=smooth(xf), v=smooth(yf);
  return lerp(lerp(hash2(xi,yi),hash2(xi+1,yi),u),
              lerp(hash2(xi,yi+1),hash2(xi+1,yi+1),u), v);
}
export function fbm(x,y,oct=4,lac=2.0,gain=0.5){
  let a=1,f=1,s=0,n=0;
  for(let i=0;i<oct;i++){s+=a*vnoise(x*f,y*f);n+=a;a*=gain;f*=lac;}
  return s/n;
}
