/* Static-site adaptation of Arc UI's Expanding Search component.
 * Reference and original source: https://uiarc.dev/components/expanding-search
 * Retains ranked local results, highlighted matches, expanding field, and combobox keys.
 */
const escapeHtml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const aliases={
 general:['doctor','fever','cough','cold','children','child','infection'],
 mental:['therapy','psychologist','psychiatrist','anxiety','stress','wellbeing'],
 nutrition:['weight loss','diet','dietitian','nutrition'],
 specialist:['gynaecology','gynecology','neurology','endocrinology','migraine'],
 certificates:['sick leave','school','driving','sports','fitness','medical documents'],
 treatments:['treatment review','skin','pain','allergies','medication'],
 renewals:['blood test','lab test','prescription','refill','renewal']
};

// Arc's ranking: title starts, word starts, title matches, then keyword/meta matches.
function rank(items,query){
 const q=query.toLocaleLowerCase();
 return items.map((item,order)=>{
  const title=item.name.toLocaleLowerCase(),at=title.indexOf(q);
  const extra=[item.short,item.description,item.category,...item.topics,...(aliases[item.id]||[])].some(word=>word.toLocaleLowerCase().includes(q));
  const score=at===0?0:at>0&&/[\s\-/]/.test(title[at-1])?1:at>0?2:extra?3:-1;
  return {item,score,order};
 }).filter(x=>x.score>=0).sort((a,b)=>a.score-b.score||a.order-b.order).slice(0,7).map(x=>x.item);
}
function match(text,query){
 const at=query?text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()):-1;
 return at<0?escapeHtml(text):`${escapeHtml(text.slice(0,at))}<mark>${escapeHtml(text.slice(at,at+query.length))}</mark>${escapeHtml(text.slice(at+query.length))}`;
}

export function initExpandingSearch(root,items,onSelect,onExpand=()=>{}){
 const trigger=root.querySelector('.search-trigger'),input=root.querySelector('input');
 const clear=root.querySelector('.search-clear'),panel=root.querySelector('.search-panel');
 const body=root.querySelector('.search-panel-body'),list=root.querySelector('[role=listbox]');
 const empty=root.querySelector('.search-empty'),announcement=root.querySelector('[role=status]');
 let expanded=false,active=-1,results=items;

 function measure(){
  root.style.setProperty('--search-expanded-width',`${root.clientWidth}px`);
  if(!expanded)return;
  const vv=window.visualViewport,viewTop=vv?.offsetTop||0,viewBottom=viewTop+(vv?.height||innerHeight);
  const field=root.getBoundingClientRect(),heroBottom=root.closest('.hero').getBoundingClientRect().bottom;
  const below=Math.min(viewBottom,heroBottom)-field.bottom-20,above=field.top-viewTop-84;
  const side=below<140&&above>below?'above':'below';
  root.dataset.side=side;
  root.style.setProperty('--search-space',`${Math.max(60,Math.floor(side==='above'?above:below))}px`);
 }
 function highlight(scroll=false){
  const options=[...list.querySelectorAll('[role=option]')],chosen=options[active];
  options.forEach((option,index)=>option.setAttribute('aria-selected',String(index===active)));
  const glow=list.querySelector('.search-highlight');
  if(chosen){
   input.setAttribute('aria-activedescendant',chosen.id);
   glow.hidden=false;glow.style.height=`${chosen.offsetHeight}px`;glow.style.transform=`translateY(${chosen.offsetTop}px)`;
   if(scroll){const r=chosen.getBoundingClientRect(),b=body.getBoundingClientRect();if(r.bottom>b.bottom)body.scrollTop+=r.bottom-b.bottom;if(r.top<b.top)body.scrollTop-=b.top-r.top;}
  }else{input.removeAttribute('aria-activedescendant');glow.hidden=true;}
 }
 function render(){
  const query=input.value.trim();results=query?rank(items,query):items;
  active=Math.min(active,results.length-1);
  list.innerHTML=`<div class="search-highlight" aria-hidden="true" hidden></div><div id="care-search-group" class="search-group-label" role="presentation">${query?'Matching services':'Browse services'}</div><div role="group" aria-labelledby="care-search-group">${results.map(item=>`<div class="search-option" id="care-search-${item.id}" role="option" aria-selected="false" data-id="${item.id}"><span class="search-option-title">${match(item.name,query)}</span><span class="search-option-meta">${escapeHtml(item.short)}</span></div>`).join('')}</div>`;
  list.hidden=!results.length;empty.hidden=!!results.length;clear.hidden=!input.value;
  announcement.textContent=expanded?(results.length?`${results.length} ${query?'matching':'available'} services`:'No matching services'):'';
  body.scrollTop=0;highlight();measure();
 }
 function expand(){
  if(expanded)return;expanded=true;onExpand();root.dataset.expanded='true';trigger.hidden=true;
  input.inert=false;input.tabIndex=0;panel.hidden=false;input.setAttribute('aria-expanded','true');
  render();input.focus({preventScroll:true});measure();
 }
 function collapse(restoreFocus=false){
  if(!expanded)return;expanded=false;root.dataset.expanded='false';panel.hidden=true;input.inert=true;input.tabIndex=-1;
  input.value='';active=-1;clear.hidden=true;trigger.hidden=false;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');announcement.textContent='';
  if(restoreFocus)trigger.focus({preventScroll:true});
 }
 function choose(id){const service=items.find(item=>item.id===id);if(!service)return;collapse(true);onSelect(service,trigger);}
 trigger.addEventListener('click',expand);
 input.addEventListener('input',()=>{active=input.value.trim()?0:-1;render();});
 input.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();collapse(true);return;}
  if(!results.length)return;
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();const step=event.key==='ArrowDown'?1:-1;
   active=active<0?(step>0?0:results.length-1):(active+step+results.length)%results.length;highlight(true);
  }else if(event.key==='Enter'&&active>=0){event.preventDefault();choose(results[active].id);}
 });
 list.addEventListener('pointermove',event=>{const option=event.target.closest('[role=option]');if(option){active=results.findIndex(item=>item.id===option.dataset.id);highlight();}});
 list.addEventListener('mousedown',event=>event.preventDefault());
 list.addEventListener('click',event=>{const option=event.target.closest('[role=option]');if(option)choose(option.dataset.id);});
 clear.addEventListener('mousedown',event=>event.preventDefault());
 clear.addEventListener('click',()=>{input.value='';active=-1;render();input.focus({preventScroll:true});});
 root.addEventListener('focusout',()=>{setTimeout(()=>{if(document.hasFocus()&&!root.contains(document.activeElement))collapse(false);},0);});
 document.addEventListener('pointerdown',event=>{if(!root.contains(event.target))collapse(false);});
 const observer=new ResizeObserver(measure);observer.observe(root);
 addEventListener('resize',measure);addEventListener('scroll',measure,{passive:true});
 window.visualViewport?.addEventListener('resize',measure);window.visualViewport?.addEventListener('scroll',measure);
 measure();
}
