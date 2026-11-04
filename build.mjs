import {cp,rm,mkdir,readFile,writeFile} from 'node:fs/promises';
import {services,faqs,guides} from './src/content.mjs';
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
let html=await readFile('src/index.html','utf8');
const featured=[services[0],services[1],services[6],services[3]];
html=html.replace('<!-- SERVICE_CARDS -->',featured.map((s,i)=>`<button class="care-card" data-service="${s.id}"><span class="glass-image" data-glass="hover" data-src="assets/${s.image||'field.jpg'}" data-focus="${s.focus||'50% 55%'}"><img src="assets/${s.image||'field.jpg'}" alt="" loading="lazy" width="600" height="800"></span><span class="care-card-top"><span>0${i+1}</span><span class="card-arrow" aria-hidden="true">↗</span></span><span class="care-card-bottom"><strong>${esc(s.name)}</strong><span class="card-meta"><span>From €${s.price}</span><span>${s.duration}</span></span></span></button>`).join(''));
html=html.replace('<!-- SERVICE_ROWS -->',services.map((s,i)=>`<button class="service-row" data-service="${s.id}"><span class="row-index">0${i+1}</span><span class="row-copy"><strong>${esc(s.name)}</strong><span>${esc(s.short)}</span></span><span class="row-price">From €${s.price}</span><span class="row-arrow" aria-hidden="true">↗</span></button>`).join(''));
html=html.replace('<!-- FAQ -->',faqs.map(([q,a],i)=>`<div class="faq-item"><h3><button class="faq-toggle" aria-expanded="false" aria-controls="answer-${i}"><span>${esc(q)}</span><span class="faq-icon" aria-hidden="true"></span></button></h3><div id="answer-${i}" class="faq-answer" inert><div><p>${esc(a)}</p></div></div></div>`).join(''));
html=html.replace('<!-- GUIDES -->',guides.map(g=>`<button class="guide-card" data-guide="${g.id}"><span class="guide-image"><img src="assets/${g.image}" alt="" loading="lazy" width="600" height="420" style="object-position:${g.focus}"><span class="card-arrow" aria-hidden="true">↗</span></span><span class="guide-meta">${g.type}<span>${g.read}</span></span><strong>${g.title}</strong></button>`).join(''));
html=html.replace(/src="assets\/([^"]+)\.jpg"/g,(match,name)=>{const doctor=name.startsWith('doctor');const widths=doctor?[480,768]:[480,960,1600];return `${match} srcset="${widths.map(w=>`assets/${name}-${w}.jpg ${w}w`).join(', ')}" sizes="${doctor?'(max-width: 599px) 132px, 33vw':'(max-width: 599px) 100vw, 50vw'}"`;});
html=html.replace(/<button class="care-card"[\s\S]*?<\/button>/g,card=>card.replace(/sizes="[^"]+"/,'sizes="750px"'));
html=html.replace(/<img[^>]+fetchpriority="high"[^>]*>/g,tag=>tag.replace(/sizes="[^"]+"/,'sizes="(max-width: 809px) 150vh, 100vw"'));
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});await cp('src/assets','dist/assets',{recursive:true});await cp('src/styles','dist/styles',{recursive:true});await cp('src/scripts','dist/scripts',{recursive:true});await cp('src/content.mjs','dist/scripts/content.mjs');await writeFile('dist/index.html',html);// A second entry point shares content and behavior, with its own visual palette.
let blue=html.replace('<html lang="en">','<html lang="en" data-design="02">')
 .replace('<title>Carevia — Care that fits into your life.</title>','<title>Carevia — Design 02 · Blue</title>')
 .replace('href="styles/site.css"','href="styles/site-blue.css"')
 .replace('rel="canonical" href="https://carevia-glass.triple-labs-8416.chatgpt.site/"','rel="canonical" href="https://carevia-glass.triple-labs-8416.chatgpt.site/design-02.html"')
 .replace(/<head>[\s\S]*?<\/head>/,head=>head.replaceAll('assets/freedom-','assets/sea-'))
 .replace(/<div class="glass-image hero-image"[\s\S]*?<\/div>/,`<div class="glass-image hero-image" data-glass="lens" data-src="assets/sea.jpg" data-focus="50% 58%" data-mobile-focus="51% 50%" data-lens-center=".5" data-mobile-lens=".5" data-strength="1.4" data-drift=".06" data-lens-size=".55"><img src="assets/sea.jpg" srcset="assets/sea-480.jpg 480w, assets/sea-960.jpg 960w, assets/sea-1600.jpg 1600w" sizes="(max-width: 809px) 150vh, 100vw" alt="Friends swimming and jumping into the blue Mediterranean Sea" width="2391" height="2023" fetchpriority="high"></div>`)
 .replaceAll('href="/" aria-current="page"','href="/"')
 .replaceAll('href="/design-02.html"','href="/design-02.html" aria-current="page"')
 .replaceAll('<span class="design-current" aria-hidden="true">●</span>','')
 .replaceAll('<small>Blue · coastal</small></span></a>','<small>Blue · coastal</small></span><span class="design-current" aria-hidden="true">●</span></a>');
const css=await readFile('src/styles/site.css','utf8');
// Recolor the full visual system, including translucent image shades and panels.
function coastal(hex){
 let raw=hex.slice(1);if(raw.length===3||raw.length===4)raw=[...raw].map(c=>c+c).join('');
 const alpha=raw.slice(6);let rgb=[0,2,4].map(i=>parseInt(raw.slice(i,i+2),16)/255);
 const hi=Math.max(...rgb),lo=Math.min(...rgb),l=(hi+lo)/2,d=hi-lo;
 if(!d)return hex;
 let saturation=d/(1-Math.abs(2*l-1));
 saturation=Math.max(saturation,l>.8?.32:.24);
 const h=211/60,c=(1-Math.abs(2*l-1))*saturation,x=c*(1-Math.abs(h%2-1)),m=l-c/2;
 return '#'+[0,x,c].map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('')+alpha;
}
const blueCss=css.replace(/#[0-9a-f]{3,8}\b/gi,coastal)+`
:root{--paper:#f0f6fb;--surface:#fafdff;--wash:#e1edf7;--ink:#102b48;--secondary:#476580;--muted:#637f9a;--line:#193d6126;--green:#205e9b;--mint:#b9e3ff;--forest:#112f50;--white:#f3f8ff;--nav:#f0f6fbed}
:root[data-theme=dark]{--paper:#0c1b2c;--surface:#122840;--wash:#1a3653;--ink:#edf6ff;--secondary:#b3c9df;--muted:#809fbd;--line:#c7e3ff26;--green:#a3d5ff;--nav:#122840ed}
.hero-image{transform:none}.hero-shade{background:linear-gradient(0deg,#061a34eb 0%,#09264760 35%,#0d30500a 72%)}
`;
await writeFile('dist/styles/site-blue.css',blueCss);
await writeFile('dist/design-02.html',blue.replace('name="theme-color" content="#f3f2ed"','name="theme-color" content="#f0f6fb"'));
// Design 03 retains Design 01's styling, images, and behavior; only headings change.
const serif=html.replace('<html lang="en">','<html lang="en" data-design="03">')
 .replace('<title>Carevia — Care that fits into your life.</title>','<title>Carevia — Design 03 · Geist Serif</title>')
 .replace('rel="canonical" href="https://carevia-glass.triple-labs-8416.chatgpt.site/"','rel="canonical" href="https://carevia-glass.triple-labs-8416.chatgpt.site/design-03.html"')
 .replace('<link rel="stylesheet" href="styles/site.css">','<link rel="preload" href="assets/geist-serif-regular.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="styles/site.css"><link rel="stylesheet" href="styles/site-serif.css">')
 .replaceAll('href="/" aria-current="page"','href="/"')
 .replaceAll('<span class="design-current" aria-hidden="true">●</span>','')
 .replaceAll('href="/design-03.html"','href="/design-03.html" aria-current="page"')
 .replaceAll('<small>Olive · Geist Serif</small></span></a>','<small>Olive · Geist Serif</small></span><span class="design-current" aria-hidden="true">●</span></a>');
await writeFile('dist/design-03.html',serif);
// The Smilara-inspired fourth design uses its own presentation and interactions.
let editorial=await readFile('src/design-04.html','utf8');
const v4Images={general:['freedom','30% 45%'],mental:['sky','50% 70%'],renewals:['field','50% 55%'],specialist:['sea','50% 50%']};
editorial=editorial.replace('<!-- V4_CARDS -->',[services[0],services[1],services[6],services[3]].map((s,i)=>{const[image,focus]=v4Images[s.id];return `<article class="treatment-card"><img src="assets/${image}-960.jpg" alt="" loading="lazy" width="704" height="538" style="object-position:${focus}"><div class="treatment-body"><span class="mono">0${i+1}</span><h3>${esc(s.name)}</h3><p>${esc(s.short)}</p><button class="care-open" data-service="${s.id}" aria-label="Explore ${esc(s.name)}"><span>From €${s.price} · ${esc(s.duration)}</span><span aria-hidden="true">↗</span></button></div></article>`}).join(''));
editorial=editorial.replace('<!-- V4_FAQ -->',faqs.slice(0,6).map(([q,a],i)=>`<div class="faq-item${i===0?' open':''}"><h3><button class="faq-toggle" aria-expanded="${i===0}" aria-controls="v4-answer-${i}"><span>${esc(q)}</span><span class="faq-icon" aria-hidden="true">⌄</span></button></h3><div class="faq-answer" id="v4-answer-${i}" ${i===0?'':'inert'}><div><p>${esc(a)}</p></div></div></div>`).join(''));
await writeFile('dist/design-04.html',editorial);
const geistEditorial=editorial.replace('data-design="04"','data-design="04.1"')
 .replace('<title>Carevia — Design 04</title>','<title>Carevia — Design 04.1 · Geist Sans</title>')
 .replace('rel="canonical" href="https://carevia-glass.triple-labs-8416.chatgpt.site/design-04.html"','rel="canonical" href="https://carevia-glass.triple-labs-8416.chatgpt.site/design-04-1.html"')
 .replaceAll('assets/aileron-400.woff2','assets/geist-400.woff2').replaceAll('assets/aileron-700.woff2','assets/geist-700.woff2')
 .replace('<link rel="stylesheet" href="styles/design-04.css">','<link rel="stylesheet" href="styles/design-04.css"><link rel="stylesheet" href="styles/design-04-1.css">')
 .replaceAll('href="/design-04.html" aria-current="page"','href="/design-04.html"')
 .replaceAll('href="/design-04-1.html"','href="/design-04-1.html" aria-current="page"')
 .replace('Smilara · editorial <span aria-hidden="true">●</span>','Smilara · editorial')
 .replace('Smilara · Geist Sans</small>','Smilara · Geist Sans <span aria-hidden="true">●</span></small>');
await writeFile('dist/design-04-1.html',geistEditorial);
const clashEditorial=editorial.replace('data-design="04"','data-design="04.2"')
 .replace('<title>Carevia — Design 04</title>','<title>Carevia — Design 04.2 · Clash Grotesk</title>')
 .replace('rel="canonical" href="https://carevia-glass.triple-labs-8416.chatgpt.site/design-04.html"','rel="canonical" href="https://carevia-glass.triple-labs-8416.chatgpt.site/design-04-2.html"')
 .replace(/<img class="hero-photo"[^>]*>/,'<img class="hero-photo" src="assets/hero-care-1600.jpg" srcset="assets/hero-care-960.jpg 960w, assets/hero-care-1600.jpg 1600w" sizes="100vw" alt="A woman waves at someone on her laptop from a living room" fetchpriority="high" width="1920" height="1281">')
 .replace(/<h1>Thoughtful care combining[\s\S]*?<\/h1>/,'<h1>Care that fits your life.</h1>')
 .replace(/<link rel="preload" href="assets\/aileron-(?:400|700).woff2" as="font" type="font\/woff2" crossorigin>/g,'')
 .replace('<link rel="stylesheet" href="styles/design-04.css">','<link rel="preload" href="assets/clash-grotesk-variable.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="styles/design-04.css"><link rel="stylesheet" href="styles/design-04-2.css">')
 .replaceAll('href="/design-04.html" aria-current="page"','href="/design-04.html"')
 .replaceAll('href="/design-04-2.html"','href="/design-04-2.html" aria-current="page"')
 .replace('Smilara · editorial <span aria-hidden="true">●</span>','Smilara · editorial')
 .replace('Smilara · Clash Grotesk</small>','Smilara · Clash Grotesk <span aria-hidden="true">●</span></small>');
await writeFile('dist/design-04-2.html',clashEditorial);
console.log('Built all Carevia designs, including Design 04.2.');
