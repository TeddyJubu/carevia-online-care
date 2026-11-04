/* Static-site adaptation of Arc UI's FAQ Section accordion.
 * Reference and original source: https://uiarc.dev/components/blocks/faq-section
 * Keeps single-open state, rotating plus controls, answer motion, and list navigation.
 */
export function initFaqSection(root){
 const triggers=[...root.querySelectorAll('[data-faq-trigger]')];
 const reduced=matchMedia('(prefers-reduced-motion:reduce)');
 const animations=new Map();

 function setOpen(trigger,open){
  const item=trigger.closest('.care-faq-item'),panel=document.getElementById(trigger.getAttribute('aria-controls'));
  const from=panel.hidden?0:panel.getBoundingClientRect().height;
  const opacity=panel.hidden?0:parseFloat(getComputedStyle(panel).opacity);
  animations.get(panel)?.cancel();
  trigger.setAttribute('aria-expanded',String(open));
  item.toggleAttribute('data-open',open);panel.inert=!open;panel.setAttribute('aria-hidden',String(!open));
  if(reduced.matches){panel.hidden=!open;panel.style.height='';panel.style.opacity='';return;}
  panel.hidden=false;
  const to=open?panel.scrollHeight:0;
  panel.style.height=open?'auto':'0px';panel.style.opacity=open?'1':'0';
  const animation=panel.animate([{height:`${from}px`,opacity},{height:`${to}px`,opacity:open?1:0}],{duration:open?360:260,easing:'cubic-bezier(.22,1,.36,1)'});
  animations.set(panel,animation);
  animation.finished.then(()=>{
   if(animations.get(panel)!==animation)return;
   animations.delete(panel);panel.hidden=!open;panel.style.height='';panel.style.opacity='';
  }).catch(()=>{});
 }

 triggers.forEach(trigger=>trigger.addEventListener('click',()=>{
  const opening=trigger.getAttribute('aria-expanded')!=='true';
  if(opening)triggers.forEach(other=>{if(other!==trigger&&other.getAttribute('aria-expanded')==='true')setOpen(other,false);});
  setOpen(trigger,opening);
 }));
 root.querySelector('.care-faq-list').addEventListener('keydown',event=>{
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  const current=triggers.indexOf(document.activeElement);if(current<0)return;
  event.preventDefault();
  const next=event.key==='Home'?0:event.key==='End'?triggers.length-1:(current+(event.key==='ArrowDown'?1:-1)+triggers.length)%triggers.length;
  triggers[next].focus();
 });
 reduced.addEventListener('change',()=>{
  animations.forEach((animation,panel)=>{animation.cancel();panel.hidden=panel.getAttribute('aria-hidden')==='true';panel.style.height='';panel.style.opacity='';});
  animations.clear();
 });
}
