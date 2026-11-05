// Design 04.5 "About" as a pinned horizontal story: vertical scroll drives the track sideways,
// the blur lives in CSS (.ah-pin::after), a fixed strip over the left 20% of the screen that panels slide under.
// --p (0..1) feeds the progress line. Under reduced motion the CSS stacks the panels and this script stands down.
const section=document.querySelector('.about-h');
if(section){
  const track=section.querySelector('.ah-track');
  const still=matchMedia('(prefers-reduced-motion: reduce)');
  let travel=0,raf=0;
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  function measure(){
    if(still.matches){ // plain vertical stack: no height trick, no transform, no blur, no progress
      travel=0;
      section.style.removeProperty('--travel');section.style.removeProperty('--p');
      track.style.transform='';section.classList.remove('is-moving');
      return;
    }
    travel=Math.max(0,track.scrollWidth-innerWidth);
    section.style.setProperty('--travel',`${travel}px`); // section height = travel + one screen, so 1px down = 1px sideways
    paint();
  }
  function paint(){
    raf=0;
    if(still.matches)return;
    const p=clamp(-section.getBoundingClientRect().top/Math.max(travel,1),0,1),x=-p*travel;
    track.style.transform=`translate3d(${x}px,0,0)`;
    section.style.setProperty('--p',p.toFixed(4));
    section.classList.toggle('is-moving',x<-2&&x>2-travel); // blur strip only while panels travel: off at rest on the first and last panel (2px slack for fractional scroll offsets)
  }
  addEventListener('scroll',()=>{raf||=requestAnimationFrame(paint)},{passive:true});
  addEventListener('resize',measure);
  still.addEventListener('change',measure);
  new ResizeObserver(measure).observe(track);
  measure();
}
