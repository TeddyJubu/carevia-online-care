/* Static-site port of React Bits' FolderFloat (https://reactbits.dev, FolderFloat-JS-CSS).
 * Each .folder-float in root is a folder; clicking it tips the front flap and floats its
 * category pills up out of it. One folder is open at a time. Clicking a pill calls onSelect.
 * ponytail: the original's matter-js drag physics is left out; the CSS drift covers the float.
 */
const GAP=10,ROW=46,LIFT=26,TILT=6;
// Stable pseudo-random 0..1 per pill, so the scatter is the same every time.
const jitter=i=>{const x=Math.sin(i*12.9898+4.1414)*43758.5453;return x-Math.floor(x)};

// Wrap pills into rows of at most maxW, nearest row just above the folder, each row centred
// on the folder but slid sideways to stay inside the root (rootW wide). x/y are relative to the
// folder's top centre. Rows squeeze together (down to 36px apart) to fit maxUp, the room above.
function layout(widths,maxW,rootW,cx,maxUp){
 const rows=[];let row=[],w=0;
 widths.forEach((pw,i)=>{if(row.length&&w+GAP+pw>maxW){rows.push({row,w});row=[];w=0}row.push({i,pw});w+=(row.length>1?GAP:0)+pw});
 if(row.length)rows.push({row,w});
 const step=rows.length>1?Math.max(36,Math.min(ROW,(maxUp-LIFT-6)/(rows.length-1))):ROW,pos=[];
 rows.forEach(({row,w},ri)=>{
  const shift=(ri%2?1:-1)*8;
  let left=Math.min(Math.max(cx-w/2+shift,0),Math.max(rootW-w,0));
  row.forEach(({i,pw})=>{const j=jitter(i);pos[i]={x:left+pw/2-cx+(j-.5)*6,y:-LIFT-ri*step-j*6,r:TILT*(j*2-1)};left+=pw+GAP});
 });
 return {pos,fits:LIFT+6+(rows.length-1)*step<=maxUp};
}
// Keep the cluster tight over its folder (about 1.5x its width), widening only when a tall
// stack wouldn't fit in the room above.
function place(widths,folderW,rootW,cx,maxUp){
 let r;
 for(let maxW=Math.min(folderW*1.5,rootW);;maxW+=40){r=layout(widths,Math.min(maxW,rootW),rootW,cx,maxUp);if(r.fits||maxW>=rootW)return r.pos}
}

export function initFolderFloat(root,{onSelect}={}){
 const folders=[...root.querySelectorAll('.folder-float')];
 let open=null;
 function set(folder,next){
  if(!next){if(folder&&folder===open){folder.removeAttribute('data-open');folder.querySelector('.folder-float__trigger').setAttribute('aria-expanded','false');folder.querySelectorAll('.folder-float__item').forEach(p=>p.tabIndex=-1);open=null}return}
  if(open)set(open,false);
  // Measure and place the pills on open, so they always fit the popup's current width.
  const pills=[...folder.querySelectorAll('.folder-float__item')],rr=root.getBoundingClientRect(),fr=folder.getBoundingClientRect(),top=root.closest('dialog')?.getBoundingClientRect().top??0;
  place(pills.map(p=>p.offsetWidth),fr.width,rr.width,fr.left+fr.width/2-rr.left,fr.top-top-8).forEach((p,i)=>{
   pills[i].style.setProperty('--x',`${p.x.toFixed(1)}px`);pills[i].style.setProperty('--y',`${p.y.toFixed(1)}px`);pills[i].style.setProperty('--r',`${p.r.toFixed(2)}deg`);pills[i].tabIndex=0;
  });
  folder.setAttribute('data-open','');folder.querySelector('.folder-float__trigger').setAttribute('aria-expanded','true');open=folder;
 }
 folders.forEach(folder=>{
  const trigger=folder.querySelector('.folder-float__trigger');
  trigger.addEventListener('click',()=>set(folder,open!==folder));
  folder.querySelectorAll('.folder-float__item').forEach(p=>p.addEventListener('click',()=>{p.setAttribute('data-pop','');onSelect?.(p,folder)}));
  // Escape closes the folder first; a second Escape closes the popup as usual.
  folder.addEventListener('keydown',e=>{if(e.key==='Escape'&&open===folder){e.preventDefault();e.stopPropagation();set(folder,false);trigger.focus()}});
 });
 // A click anywhere else in the popup closes the open folder. The dialog outlives this content,
 // so the listener removes itself once the folders have been swapped out.
 const dialog=root.closest('dialog'),outside=e=>{if(!root.isConnected)return dialog.removeEventListener('click',outside);if(open&&!open.contains(e.target))set(open,false)};
 dialog?.addEventListener('click',outside);
}
