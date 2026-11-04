// Design 04.5 "About" as a pinned horizontal story: vertical scroll drives the track sideways,
// the blur lives in CSS (.ah-pin::after), a fixed strip over the left 20% of the screen that panels slide under.
const section=document.querySelector('.about-h');
if(section){
  const track=section.querySelector('.ah-track');
  let travel=0,raf=0;
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  function measure(){
    travel=Math.max(0,track.scrollWidth-innerWidth);
    section.style.setProperty('--travel',`${travel}px`); // section height = travel + one screen, so 1px down = 1px sideways
    paint();
  }
  function paint(){
    raf=0;
    const x=-clamp(-section.getBoundingClientRect().top/Math.max(travel,1),0,1)*travel;
    track.style.transform=`translate3d(${x}px,0,0)`;
    section.classList.toggle('is-moving',x<-1&&x>1-travel); // blur strip only while panels travel: off at rest on the first and last panel
  }
  addEventListener('scroll',()=>{raf||=requestAnimationFrame(paint)},{passive:true});
  addEventListener('resize',measure);
  new ResizeObserver(measure).observe(track);
  measure();
}
