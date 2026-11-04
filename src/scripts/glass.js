// Fluted-glass geometry follows the Alder reference: horizontal image refraction,
// a softly interpolated clear lens, and a centre-out clear on hover/in view.
const clamp=(v,min=0,max=1)=>Math.min(max,Math.max(min,v));
const smooth=(a,b,x)=>{let t=clamp((x-a)/(b-a||1));return t*t*(3-2*t)};
export class GlassPhoto{
 constructor(el,reduced){
  this.el=el;this.img=el.querySelector('img');this.mode=el.dataset.glass||'lens';this.reduced=reduced;this.strips=[];this.visible=false;this.raf=0;this.x=-1;this.target=-1;this.open=0;this.openTarget=0;this.clear=0;this.clearTarget=0;this.pointer=false;this.start=performance.now();this.coarse=matchMedia('(hover: none)').matches;
  const [fx,fy]=(el.dataset.focus||'50% 50%').split(' ').map(parseFloat);this.focusX=fx;this.focusY=fy;el.style.setProperty('--focus',`${fx}% ${fy}%`);
  this.layer=document.createElement('span');this.layer.className='glass-strips';this.layer.setAttribute('aria-hidden','true');el.append(this.layer);
  this.host=el.closest('.care-card,.hero,.closing-card,.journey-visual,.wide-banner')||el;
  if(!reduced){this.host.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;this.pointer=true;const rect=this.el.getBoundingClientRect();const localX=(e.clientX-rect.left)*this.w/rect.width;this.target=this.el.dataset.mirrored==='true'?this.w-localX:localX;this.openTarget=1;if(this.mode==='hover')this.clearTarget=1;this.schedule()},{passive:true});this.host.addEventListener('pointerleave',()=>{this.pointer=false;if(this.mode==='hover')this.clearTarget=0;this.schedule()});}
  this.resize=new ResizeObserver(()=>this.layout());this.resize.observe(el);
  if(this.img.complete&&this.img.naturalWidth)this.layout();;this.img.addEventListener('load',()=>this.layout());
  this.observe=new IntersectionObserver(entries=>{const e=entries[0];this.visible=e.isIntersecting;if(this.mode==='inview'&&e.intersectionRatio>.35)this.clearTarget=1;this.visible?this.schedule():this.stop()},{threshold:[0,.35,.65]});this.observe.observe(el);
  document.addEventListener('visibilitychange',()=>document.hidden?this.stop():this.schedule());
 }
 layout(){
  const isMobile=innerWidth<810;const focus=(isMobile&&this.el.dataset.mobileFocus?this.el.dataset.mobileFocus:this.el.dataset.focus||'50% 50%').split(' ').map(parseFloat);this.focusX=focus[0];this.focusY=focus[1];this.el.style.setProperty('--focus',`${this.focusX}% ${this.focusY}%`);this.lensCenter=Number(isMobile&&this.el.dataset.mobileLens?this.el.dataset.mobileLens:this.el.dataset.lensCenter||.5);this.strength=Number(this.el.dataset.strength||2.6);this.w=Math.round(this.el.clientWidth);this.h=Math.round(this.el.clientHeight);if(!this.w||!this.h||!this.img.naturalWidth||this.reduced)return;
  const count=Math.min(this.coarse?40:72,Math.max(4,Math.round(this.w/(this.mode==='lens'?34:this.mode==='hover'?14:28))));this.layer.replaceChildren();this.strips=[];this.step=this.w/count;
  const zoom=Math.max(this.w/this.img.naturalWidth,this.h/this.img.naturalHeight);this.imageW=this.img.naturalWidth*zoom;this.imageH=this.img.naturalHeight*zoom;this.cropX=(this.imageW-this.w)*this.focusX/100;this.cropY=(this.imageH-this.h)*this.focusY/100;
  for(let i=0;i<count;i++){let s=document.createElement('span');s.className='glass-strip';s.style.left=`${i*this.step}px`;s.style.width=`${this.step+.65}px`;s.style.backgroundImage=`url("${this.img.currentSrc||this.img.src}")`;let gloss=document.createElement('i');s.append(gloss);this.layer.append(s);this.strips.push({el:s,gloss})}
  if(this.x<0){this.x=this.w*(this.lensCenter||.5);this.target=this.x}this.render();this.schedule();
 }
 render(){
  if(!this.strips.length)return;let lensRadius=this.w*Number(this.el.dataset.lensSize||.36)/2,mid=(this.strips.length-1)/2;
  this.strips.forEach(({el,gloss},i)=>{let center=(i+.5)*this.step,distortion=1;if(this.mode==='lens')distortion=1-this.open*(1-smooth(lensRadius*.3,lensRadius,Math.abs(center-this.x)));else{let edge=mid?Math.abs(i-mid)/mid:0,t=clamp(this.clear*1.7-edge*.7);const hoverClear=1-t*t*(3-2*t);distortion=this.mode==='hover'?smooth(.5,1,edge)*hoverClear:hoverClear}const strength=1+(this.strength-1)*distortion;el.style.backgroundSize=`${this.imageW/strength}px ${this.imageH}px`;el.style.backgroundPosition=`${this.step/2-(center+this.cropX)/strength}px ${-this.cropY}px`;gloss.style.opacity=String(distortion*.6)});
 }
 tick(now){
  this.raf=0;if(!this.visible||document.hidden||this.reduced)return;let again=false;
  if(this.mode==='lens'){if(!this.pointer){this.target=this.w*clamp(this.lensCenter+Number(this.el.dataset.drift||.18)*Math.sin((now-this.start)*.00042),.12,.88);this.openTarget=1;again=true}this.x+=(this.target-this.x)*.09;this.open+=(this.openTarget-this.open)*.06;if(Math.abs(this.target-this.x)>.3||Math.abs(this.openTarget-this.open)>.002)again=true}
  else{this.clear+=(this.clearTarget-this.clear)*.07;if(Math.abs(this.clearTarget-this.clear)>.002)again=true;else this.clear=this.clearTarget}
  this.render();if(again)this.raf=requestAnimationFrame(t=>this.tick(t));
 }
 schedule(){if(this.visible&&!this.raf&&!this.reduced&&!document.hidden&&this.w)this.raf=requestAnimationFrame(t=>this.tick(t))}
 stop(){if(this.raf)cancelAnimationFrame(this.raf);this.raf=0}
}
