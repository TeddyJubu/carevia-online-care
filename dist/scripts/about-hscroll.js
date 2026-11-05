// Design 04.5 "About" as a pinned horizontal story: vertical scroll drives the track sideways.
// On the way out, each panel passes through the left 10% of the screen: the photo turns into frosted glass and text
// softens (CSS in build.mjs). This script gives each of them --z, how many px of it are inside that zone.
// --p (0..1) feeds the progress line. Under reduced motion the CSS stacks the panels and this script stands down.
const section=document.querySelector('.about-h');
if(section){
  const pin=section.querySelector('.ah-pin'),track=section.querySelector('.ah-track');
  const frosted=[...section.querySelectorAll('.ah-glass,.ah-copy,.ah-title,.ah-facts')];
  const still=matchMedia('(prefers-reduced-motion: reduce)');
  let travel=0,raf=0,x=0,lefts=[];
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  function measure(){
    if(still.matches){ // plain vertical stack: no height trick, no transform, no frost, no progress
      travel=0;
      section.style.removeProperty('--travel');section.style.removeProperty('--p');
      track.style.transform='';section.classList.remove('is-moving');
      return;
    }
    travel=Math.max(0,track.scrollWidth-innerWidth);
    section.style.setProperty('--travel',`${travel}px`); // section height = travel + one screen, so 1px down = 1px sideways
    // Each element's left edge with the track at rest (undo the current offset).
    const origin=pin.getBoundingClientRect().left;
    lefts=frosted.map(el=>el.getBoundingClientRect().left-origin-x);
    paint();
  }
  function paint(){
    raf=0;
    if(still.matches)return;
    const p=clamp(-section.getBoundingClientRect().top/Math.max(travel,1),0,1);
    x=-p*travel;
    track.style.transform=`translate3d(${x}px,0,0)`;
    section.style.setProperty('--p',p.toFixed(4));
    const zone=innerWidth*.1;
    frosted.forEach((el,i)=>el.style.setProperty('--z',`${(zone-lefts[i]-x).toFixed(1)}px`));
    section.classList.toggle('is-moving',x<-2&&x>2-travel); // frost only while panels travel: off at rest on the first and last panel (2px slack for fractional scroll offsets)
  }
  addEventListener('scroll',()=>{raf||=requestAnimationFrame(paint)},{passive:true});
  addEventListener('resize',measure);
  still.addEventListener('change',measure);
  new ResizeObserver(measure).observe(track);
  measure();
}
