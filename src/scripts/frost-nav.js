// Pointer-following rim and wash adapted from the supplied ChromaGrid effect.
export function initFrostNav(root){
 const tiles=[...root.querySelectorAll('.nav-pill,.nav-logo')];
 const reduced=matchMedia('(prefers-reduced-motion:reduce)');
 const fine=matchMedia('(hover:hover) and (pointer:fine)');
 const state={x:0,y:0,tx:0,ty:0,power:0,target:0,primed:false};
 let raf=0,last=0;
 function place(){const box=root.getBoundingClientRect();tiles.forEach(tile=>{const r=tile.getBoundingClientRect();tile.style.setProperty('--chroma-ox',`${r.left-box.left}px`);tile.style.setProperty('--chroma-oy',`${r.top-box.top}px`);});}
 function paint(now){
  raf=0;const dt=last?Math.min(.05,(now-last)/1000):1/60;last=now;
  const follow=1-Math.exp(-dt/(.45*.32));
  state.x+=(state.tx-state.x)*follow;state.y+=(state.ty-state.y)*follow;
  const span=state.target>state.power?.1:.6*.35;
  state.power+=(state.target-state.power)*(1-Math.exp(-dt/span));
  root.style.setProperty('--chroma-x',`${state.x.toFixed(2)}px`);root.style.setProperty('--chroma-y',`${state.y.toFixed(2)}px`);root.style.setProperty('--chroma-power',state.power.toFixed(4));
  if(Math.abs(state.tx-state.x)<.1&&Math.abs(state.ty-state.y)<.1&&Math.abs(state.target-state.power)<.002){state.power=state.target;root.style.setProperty('--chroma-power',String(state.power));last=0;}else raf=requestAnimationFrame(paint);
 }
 function wake(){if(!raf)raf=requestAnimationFrame(paint);}
 function aim(x,y){state.tx=x;state.ty=y;if(!state.primed||state.power<.02){state.x=x;state.y=y;state.primed=true;}state.target=1;wake();}
 function leave(){state.target=0;wake();}
 root.addEventListener('pointermove',event=>{if(reduced.matches||!fine.matches||event.pointerType==='touch')return;const box=root.getBoundingClientRect();aim(event.clientX-box.left,event.clientY-box.top);});
 root.addEventListener('pointerleave',leave);root.addEventListener('pointercancel',leave);
 root.addEventListener('focusin',event=>{if(reduced.matches)return;const tile=event.target.closest('.nav-pill,.nav-logo');if(!tile)return;const box=root.getBoundingClientRect(),r=tile.getBoundingClientRect();aim(r.left-box.left+r.width/2,r.top-box.top+r.height/2);});
 root.addEventListener('focusout',()=>{if(!root.contains(document.activeElement))leave();});
 reduced.addEventListener('change',()=>{cancelAnimationFrame(raf);raf=0;state.target=state.power=0;root.style.setProperty('--chroma-power','0');});
 new ResizeObserver(place).observe(root);place();
}
