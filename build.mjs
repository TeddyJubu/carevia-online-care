import {cp,rm,mkdir,readFile,writeFile} from 'node:fs/promises';
import {services,faqs,guides} from './src/content.mjs';
import {services as design42Services} from './src/services-04-2.mjs';
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
// The patient portal that 04.5 links into: PORTAL_URL=http://localhost:5180/app node build.mjs
const PORTAL_URL=(process.env.PORTAL_URL||'/app').replace(/\/+$/,'');
let html=await readFile('src/design-03.html','utf8');
const featured=[services[0],services[1],services[6],services[3]];
html=html.replace('<!-- SERVICE_CARDS -->',featured.map((s,i)=>`<button class="care-card" data-service="${s.id}"><span class="glass-image" data-glass="hover" data-src="assets/${s.image||'field.jpg'}" data-focus="${s.focus||'50% 55%'}"><img src="assets/${s.image||'field.jpg'}" alt="" loading="lazy" width="600" height="800"></span><span class="care-card-top"><span>0${i+1}</span></span><span class="care-card-bottom"><strong>${esc(s.name)}</strong><span class="card-meta"><span>From €${s.price}</span><span>${s.duration}</span></span></span></button>`).join(''));
html=html.replace('<!-- SERVICE_ROWS -->',services.map((s,i)=>`<button class="service-row" data-service="${s.id}"><span class="row-index">0${i+1}</span><span class="row-copy"><strong>${esc(s.name)}</strong><span>${esc(s.short)}</span></span><span class="row-price">From €${s.price}</span></button>`).join(''));
html=html.replace('<!-- FAQ -->',faqs.map(([q,a],i)=>`<div class="faq-item"><h3><button class="faq-toggle" aria-expanded="false" aria-controls="answer-${i}"><span>${esc(q)}</span><span class="faq-icon" aria-hidden="true"></span></button></h3><div id="answer-${i}" class="faq-answer" inert><div><p>${esc(a)}</p></div></div></div>`).join(''));
html=html.replace('<!-- GUIDES -->',guides.map(g=>`<button class="guide-card" data-guide="${g.id}"><span class="guide-image"><img src="assets/${g.image}" alt="" loading="lazy" width="600" height="420" style="object-position:${g.focus}"></span><span class="guide-meta">${g.type}<span>${g.read}</span></span><strong>${g.title}</strong></button>`).join(''));
html=html.replace(/src="assets\/([^"]+)\.jpg"/g,(match,name)=>{const doctor=name.startsWith('doctor');const widths=doctor?[480,768]:[480,960,1600];return `${match} srcset="${widths.map(w=>`assets/${name}-${w}.jpg ${w}w`).join(', ')}" sizes="${doctor?'(max-width: 599px) 132px, 33vw':'(max-width: 599px) 100vw, 50vw'}"`;});
html=html.replace(/<button class="care-card"[\s\S]*?<\/button>/g,card=>card.replace(/sizes="[^"]+"/,'sizes="750px"'));
html=html.replace(/<img[^>]+fetchpriority="high"[^>]*>/g,tag=>tag.replace(/sizes="[^"]+"/,'sizes="(max-width: 809px) 150vh, 100vw"'));
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});await cp('src/assets','dist/assets',{recursive:true});await cp('src/styles','dist/styles',{recursive:true});await cp('src/scripts','dist/scripts',{recursive:true});await cp('src/content.mjs','dist/scripts/content.mjs');
await cp('src/services-04-2.mjs','dist/scripts/services-04-2.mjs');
await writeFile('dist/design-03.html',html);
// The Smilara-inspired fourth design uses its own presentation and interactions.
let editorial=await readFile('src/design-04-2.html','utf8');
const v4Images={general:['freedom','30% 45%'],mental:['sky','50% 70%'],renewals:['field','50% 55%'],specialist:['sea','50% 50%']};
const editorialCards=[services[0],services[1],services[6],services[3]].map((s,i)=>{const[image,focus]=v4Images[s.id];return `<article class="treatment-card"><img src="assets/${image}-960.jpg" alt="" loading="lazy" width="704" height="538" style="object-position:${focus}"><div class="treatment-body"><span class="mono">0${i+1}</span><h3>${esc(s.name)}</h3><p>${esc(s.short)}</p><button class="care-open" data-service="${s.id}" aria-label="Explore ${esc(s.name)}"><span>From €${s.price} · ${esc(s.duration)}</span><span class="care-action">Details</span></button></div></article>`}).join('');
editorial=editorial.replace('<!-- V4_CARDS -->',editorialCards);
editorial=editorial.replace('<!-- V4_FAQ -->',faqs.slice(0,6).map(([q,a],i)=>`<div class="faq-item${i===0?' open':''}"><h3><button class="faq-toggle" aria-expanded="${i===0}" aria-controls="v4-answer-${i}"><span>${esc(q)}</span><span class="faq-icon" aria-hidden="true">⌄</span></button></h3><div class="faq-answer" id="v4-answer-${i}" ${i===0?'':'inert'}><div><p>${esc(a)}</p></div></div></div>`).join(''));
const design42Cards=design42Services.map((s,i)=>`<article class="treatment-card"><div class="treatment-media glass-image" data-glass="hover" data-focus="50% 50%" data-strength="1.6"><img src="assets/${s.image}-960.jpg" srcset="assets/${s.image}-480.jpg 480w, assets/${s.image}-960.jpg 960w, assets/${s.image}-1600.jpg 1600w" sizes="(max-width: 600px) 100vw, 50vw" alt="" loading="lazy" width="1200" height="800"></div><div class="treatment-body"><span class="mono">0${i+1}</span><h3>${esc(s.name)}</h3><p>${esc(s.short)}</p><button class="care-open" data-service="${s.id}" aria-label="Explore ${esc(s.name)}"><span>From €${s.price} · ${esc(s.duration)}</span><span class="care-action">Details</span></button></div></article>`).join('');
const heroSearch=`<div class="care-search" data-care-search data-expanded="false"><div class="search-shell"><button type="button" class="search-trigger" aria-label="Search Carevia services"><span>Search care</span></button><svg class="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7.3"/><path d="m16.2 16.2 4.5 4.5"/></svg><input id="care-search-input" class="search-input" type="text" role="combobox" aria-label="Search Carevia services" aria-expanded="false" aria-controls="care-search-listbox" aria-autocomplete="list" placeholder="What care do you need?" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search" inert tabindex="-1"><button type="button" class="search-clear" aria-label="Clear search" tabindex="-1" hidden><svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></div><div class="search-panel" hidden><div class="search-panel-body"><div id="care-search-listbox" role="listbox" aria-label="Care services"></div><div class="search-empty" hidden><p>No matching services.</p><span>Try a service, such as mental health or test requests.</span></div></div></div><span class="search-announcement" role="status" aria-live="polite" aria-atomic="true"></span></div><noscript><a class="button light" href="#care">Browse our care</a></noscript>`;
const faqIds=['eligibility','availability','documents','pricing','connection','after-visit'];
const design42Faq=`<section class="faq section care-faq" id="help" aria-labelledby="care-faq-title" data-faq-section><div class="care-faq-inner"><div class="care-faq-intro reveal"><p class="mono">Frequently asked questions</p><h2 class="care-faq-title" id="care-faq-title">Questions. Answers.</h2><p class="care-faq-description">A little clarity before your first visit.</p></div><ul class="care-faq-list">${faqs.slice(0,6).map(([question,answer],i)=>`<li class="care-faq-item"${i===0?' data-open':''}><h3 class="care-faq-heading"><button type="button" class="care-faq-question" id="care-faq-${faqIds[i]}-q" data-faq-trigger aria-expanded="${i===0}" aria-controls="care-faq-${faqIds[i]}-a"><span>${esc(question)}</span><svg class="care-faq-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></h3><div class="care-faq-panel" id="care-faq-${faqIds[i]}-a" role="region" aria-labelledby="care-faq-${faqIds[i]}-q" aria-hidden="${i!==0}"${i===0?'':' hidden inert'}><p class="care-faq-answer">${esc(answer)}</p></div></li>`).join('')}</ul><a class="care-faq-contact" href="https://carevia.triple-labs-8416.chatgpt.site/" target="_blank" rel="noopener"><span class="care-faq-contact-copy"><strong>Still have a question?</strong><span>Find more help on Carevia.</span></span><span class="care-faq-contact-link">Visit Carevia</span></a></div></section>`;
const clashEditorial=editorial
 .replace(editorialCards,design42Cards)
 .replace('<a href="#top" class="footer-brand"><img class="carevia-mark mark-white" src="assets/carevia-mark.png" alt="" width="40" height="40">','<a href="#top" class="footer-brand footer-brand-iridescent"><span class="footer-iridescent-mark"><img src="assets/carevia-iridescent.png" alt="" width="1600" height="1600"></span>')
 .replace(/<section class="faq section" id="help">[\s\S]*?<\/section>/,design42Faq)
 .replace('data-mobile-focus="92% 50%"','data-mobile-focus="50% 50%"')
 .replace(/<img class="hero-photo"[^>]*>/,'<picture><source media="(max-width: 1024px)" srcset="assets/hero-search-poster-960.webp 960w, assets/hero-search-poster-1440.webp 1440w" sizes="100vw" width="1440" height="936"><img class="hero-photo" src="assets/hero-telecare-1280.webp" srcset="assets/hero-telecare-960.webp 960w, assets/hero-telecare-1280.webp 1280w" sizes="100vw" alt="A clinician on a video call at her desk and an unwell patient at home searching for an online doctor in Portugal" fetchpriority="high" width="1280" height="832"></picture>')
 .replace(/<h1>Thoughtful care combining[\s\S]*?<\/h1>/,'<h1>Find the right care.<br>Feel better supported.</h1>')
 .replace('<a class="button light" href="#care">Find your care</a>',heroSearch)
await writeFile('dist/design-04-2.html',clashEditorial);
// Design 04.5: Design 04.2 with the v5 night film in place of the glass hero photo.
const heroFilm=`<video class="hero-photo hero-film" autoplay muted loop playsinline preload="auto" poster="assets/film/night.webp" aria-hidden="true"><source src="assets/film/night-720.mp4" type="video/mp4" media="(max-width: 767px)"><source src="assets/film/night-1080.mp4" type="video/mp4"></video><button class="film-toggle" type="button" aria-label="Pause film" aria-pressed="false"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect class="i-pause" x="6" y="5" width="4" height="14" rx="1"/><rect class="i-pause" x="14" y="5" width="4" height="14" rx="1"/><path class="i-play" d="M8 5.5v13l10.5-6.5z"/></svg></button><script>{const v=document.querySelector('.hero-film'),b=v.nextElementSibling,set=p=>{p?v.pause():v.play().catch(()=>{});b.setAttribute('aria-pressed',p);b.setAttribute('aria-label',p?'Play film':'Pause film')};if(matchMedia('(prefers-reduced-motion: reduce)').matches){v.removeAttribute('autoplay');set(true)}b.onclick=()=>set(!v.paused)}</script><script>addEventListener('DOMContentLoaded',()=>{const w=document.querySelector('.hero-wordmark');w&&w.addEventListener('pointermove',e=>{const r=w.getBoundingClientRect();w.style.setProperty('--mx',e.clientX-r.left+'px');w.style.setProperty('--my',e.clientY-r.top+'px')})})</script>`;
const filmStyles=`<style>.hero-film{object-fit:cover;object-position:50% 50%}
/* Deep-blue vignette: dark navy at every edge, still see-through, clearing towards the middle. */
.hero .hero-shade{background:radial-gradient(ellipse 72% 68% at 50% 50%,#0a274d00 30%,#0a274d8c 72%,#061c3ad9 100%),linear-gradient(180deg,#061c3a73,#061c3a00 22%,#061c3a00 78%,#061c3a73)}
/* Logo only: no card, larger mark. */
.topbar .nav-logo,.topbar .nav-logo:is(:hover,:active,:focus-visible){width:auto;padding:0 6px;background:none!important;border-color:transparent!important;box-shadow:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}.topbar .nav-logo::before,.topbar .nav-logo::after{display:none}.topbar .nav-logo .carevia-mark{width:58px;height:58px}
/* Liquid-metal mark (scripts/liquid-logo.js): the canvas floats over the PNG, which keeps the layout and is hidden once the shader runs. */
.liquid-logo{position:absolute;left:50%;top:50%;width:104px;height:104px;translate:-50% -50%;pointer-events:none}.nav-logo.is-metal .carevia-mark{visibility:hidden}
/* Orange specular rim (scripts/specular-nav.js): canvas spills 24px past each pill and sits at z-index -1 inside the pill's isolated stack (above its fill, below its text); 4.2's blue chroma rim is retired on the pills. */
.specular-light{position:absolute;inset:-24px;width:calc(100% + 48px);height:calc(100% + 48px);z-index:-1;pointer-events:none;opacity:0;transition:opacity .35s}.topbar .nav-pill:is(:hover,:focus-visible) .specular-light{opacity:1}.topbar .nav-pill::after{display:none}
/* Calm load: everything in the hero clears from a light blur, one after another.
   Fill is "backwards", so once done each element drops back to filter:none; a held blur(0) would still switch off the nav pills' and search bar's backdrop blur. */
@keyframes calm-in{from{opacity:0;filter:blur(6px);translate:0 6px}to{opacity:1;filter:none;translate:0 0}}
@keyframes film-in{from{opacity:0;filter:blur(10px)}to{opacity:1;filter:none}}
@keyframes wordmark45{from{opacity:0;filter:blur(8px);translate:0 10px}to{opacity:.8;filter:none;translate:0 0}}
.hero-film{animation:film-in 1.8s cubic-bezier(.25,.6,.3,1) backwards}
.topbar{animation:calm-in 1.2s .2s cubic-bezier(.25,.6,.3,1) backwards}
.hero .hero-intro>*{animation:calm-in 1.2s cubic-bezier(.25,.6,.3,1) backwards}
.hero .hero-intro>.hero-note{animation-delay:.4s}.hero .hero-intro>h1{animation-delay:.55s}.hero .hero-intro>:is(.care-search,noscript){animation-delay:.7s}
.hero .hero-wordmark{opacity:.8;animation:wordmark45 1.5s .85s cubic-bezier(.25,.6,.3,1) backwards}
.film-toggle{animation:calm-in 1s 1.1s cubic-bezier(.25,.6,.3,1) backwards}
/* Hover glow: a lit copy of the wordmark with a blue halo, revealed only in a soft circle around the pointer. */
.hero .hero-wordmark::after{content:'CAREVIA';position:absolute;inset:-48px;padding:48px;color:#fff;filter:drop-shadow(0 0 5px #c4e6ff) drop-shadow(0 0 16px #62b4ff) drop-shadow(0 0 38px #2a7dff);-webkit-mask-image:radial-gradient(circle 220px at calc(var(--mx,-999px) + 48px) calc(var(--my,-999px) + 48px),#000 0%,#000a 40%,transparent 80%);mask-image:radial-gradient(circle 220px at calc(var(--mx,-999px) + 48px) calc(var(--my,-999px) + 48px),#000 0%,#000a 40%,transparent 80%);opacity:0;transition:opacity .35s;pointer-events:none}
.hero .hero-wordmark:hover::after{opacity:1}
.hero .hero-intro{max-width:680px}.hero .hero-intro h1{font-size:clamp(32px,6.3vw,62px)}
/* Geist Serif (Design 03's face) for the hero heading and every h2. It ships in one weight, so 400 avoids faux bold. */
@font-face{font-family:"Geist Serif";src:url('assets/geist-serif-regular.woff2') format('woff2');font-weight:400;font-style:normal;font-display:swap}
.hero .hero-intro h1,h2{font-family:"Geist Serif",Georgia,serif;font-weight:400}.journey-heading h2{font-weight:400}/* Geist Serif has no light weight, so it reads lighter through size, open spacing and a softer white. */.hero .hero-intro h1{letter-spacing:-.012em;color:#ffffffe6}
/* Dark blue glass search bar (collapsed state only; the open panel stays dark so results read clearly). */
.hero .search-shell{background:linear-gradient(180deg,#123c66a6,#06203d8c);border-color:#a9d4ff33;box-shadow:inset 0 1px 0 #ffffff47,inset 0 -1px 0 #ffffff14,0 14px 40px #04162c40;backdrop-filter:blur(14px) saturate(160%) brightness(1.06);-webkit-backdrop-filter:blur(14px) saturate(160%) brightness(1.06)}
.hero .search-shell::before{content:'';position:absolute;inset:0;border-radius:inherit;padding:1.2px;background:linear-gradient(180deg,#cfe8ff73,#cfe8ff17 22%,#fff0 45%,#fff0 60%,#cfe8ff17 80%,#cfe8ff47);-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}
.hero .search-shell:hover{background:linear-gradient(180deg,#164572b3,#082546a1);border-color:#a9d4ff4d}
.hero .search-trigger>span{color:#ffffffc7}
/* Orange labels: one hue, three tints so 12px text keeps its contrast on each background. !important beats 4.2's per-section label colours. */
.mono{color:#b54e14!important;font-family:"Geist Serif",Georgia,serif!important;font-weight:400!important;letter-spacing:.01em!important;text-transform:capitalize!important;font-size:13px!important}:is(.journey-heading,footer) .mono{color:#f59e5b!important}
@media(max-width:600px){.hero .hero-intro h1{font-size:34px}.topbar .nav-logo .carevia-mark{width:46px;height:46px}.liquid-logo{width:84px;height:84px}}.film-toggle{position:absolute;z-index:6;right:24px;bottom:calc(var(--hero-fade) + 20px);width:40px;height:40px;border-radius:50%;display:grid;place-items:center;color:#fff;background:#ffffff14;border:1px solid #ffffff38;backdrop-filter:blur(6px);cursor:pointer}.film-toggle .i-play,.film-toggle[aria-pressed=true] .i-pause{display:none}.film-toggle[aria-pressed=true] .i-play{display:inline}@media(max-width:600px){.hero-film{object-position:62% 50%}.film-toggle{right:16px}}
/* Touch screens (desktop untouched): 44px tap targets, and the 112 notice at a readable size. */
@media(max-width:1024px){.film-toggle{width:44px;height:44px}.care-open{min-height:46px;padding:12px 0 0;align-items:center}.emergency>p{font-size:14px}.emergency>a{display:inline-flex;align-items:center;min-height:44px;padding-inline:4px;font-size:14px;font-weight:500}.topbar :is(.menu-toggle,.nav-logo){flex:none;min-width:44px}}
/* Phones: the heading wraps freely (balanced, no orphaned "you"), and the film button sits above the wordmark instead of on its last letter. */
@media(max-width:600px){.hero .hero-intro h1{text-wrap:balance}.hero .hero-intro h1 br{display:none}.film-toggle{bottom:calc(var(--hero-fade) + 17.7vw + 6px)}.emergency{gap:6px 12px}}
/* Desktop gets the same accessible sizing as touch: 44px film toggles and price rows, and a 14px 112 notice. The link's negative margin keeps its text on the notice's first line while its tap area stays 44px. */
@media(min-width:1025px){.film-toggle{width:44px;height:44px}.care-open{min-height:46px;padding:12px 0 0;align-items:center}.emergency>p{font-size:14px}.emergency>a{display:inline-flex;align-items:center;min-height:44px;margin-block:-11.5px;padding-inline:4px;font-size:14px;font-weight:500}}
/* Phones: Our care cards size to their content instead of 4.2's fixed 520px. Equal rows (sized by the tallest card) keep the sticky stack even, and any spare height sits above the price row so number, title and description read as one block. */
@media(max-width:600px){.treatment-stack{grid-auto-rows:1fr}.treatment-card{height:auto;grid-template-rows:220px auto}.treatment-body>h3{margin-top:12px;padding-top:0}.treatment-body>p{min-height:0;margin:10px 0 15px}.treatment-body>.care-open{margin-top:auto}}
/* Small laptops and 1024 landscape: the two-column footer from 4.2's 1000px breakpoint, so the heading keeps three lines. */
@media(min-width:1001px) and (max-width:1100px){footer{padding-top:100px}.footer-grid{grid-template-columns:1fr 1fr;gap:65px}.footer-copyright{order:3}.footer-grid>div:nth-child(2){order:1}.footer-info{order:2}.footer-wordmark{margin-top:100px}}
/* Footer links: 44px tap rows at every width (was touch-only). */
.footer-info{gap:0}.footer-info a{display:inline-flex;align-items:center;min-height:44px}.footer-info .mono:not(:first-child){margin-top:24px}
/* Touch: the WebGL rim no longer loads, so a tapped nav pill gets a plain CSS orange rim instead (same #ff9a4d as the shader). */
@media(hover:none),(pointer:coarse){.topbar .nav-pill:active{box-shadow:inset 0 0 0 1.5px #ff9a4d}}
</style>`;
const v45=clashEditorial
 .replace('data-design="04.2"','data-design="04.5"')
 .replace('/design-04-2.html"','/design-04-5.html"')
 .replace(/<div class="glass-image hero-glass"[^>]*>[\s\S]*?<\/div>/,heroFilm)
 .replace('<h1>Find the right care.<br>Feel better supported.</h1>','<h1>The doctor will see you <br>at home.</h1>')
 .replace('</head>',`<link rel="preload" href="assets/geist-serif-regular.woff2" as="font" type="font/woff2" crossorigin><script type="module" src="scripts/liquid-logo.js"></script><script type="module" src="scripts/specular-nav.js"></script>${filmStyles}</head>`);
if(!v45.includes('hero-film')||!v45.includes('see you <br>at home'))throw new Error('Design 04.5 hero replacement failed');
// 4.5 About: a pinned horizontal story (scripts/about-hscroll.js); the "Your next chapter" banner is gone and Start your care moves up below Our care.
const aboutStory=`<section class="about-h" id="about" aria-labelledby="about-title"><div class="ah-pin"><div class="ah-track">`
 +`<div class="ah-panel ah-title"><p class="mono">Your life, our starting point</p><h2 id="about-title">Online care that puts you first</h2></div>`
 +`<div class="ah-panel ah-image"><img src="assets/sea-1600.jpg" srcset="assets/sea-960.jpg 960w, assets/sea-1600.jpg 1600w" sizes="(max-width: 600px) 88vw, 72vw" alt="Friends enjoying a summer day by the sea" width="1600" height="1073" loading="lazy"></div>`
 +`<div class="ah-panel ah-copy"><p>Life doesn’t pause when you need care. We make it easier to speak to a doctor, understand your options, and get back to being you. A conversation that fits your life, wherever it finds you.</p><a class="button dark" href="#care">Explore your options</a></div>`
 +`<div class="ah-panel ah-facts"><div class="ah-fact"><strong>7</strong><span class="ah-fact-label">Areas of care</span><p>From everyday health and mental wellbeing to specialist support.</p></div><div class="ah-fact"><strong>€0</strong><span class="ah-fact-label">Monthly fees</span><p>Pay per consultation, with the price shown before you book.</p></div></div>`
 +`</div><div class="ah-progress" aria-hidden="true"><span></span></div></div></section>`;
const aboutStyles=`<style>
.about-h{position:relative;height:calc(var(--travel,0px) + 100vh)}
.ah-pin{position:sticky;top:0;height:100vh;overflow:hidden}
/* Blur lives only in the left 20% of the screen: a fixed strip that panels slide under, strongest at the edge. */
.ah-pin::after{content:'';position:absolute;inset:0 auto 0 0;width:20vw;z-index:2;pointer-events:none;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);-webkit-mask-image:linear-gradient(90deg,#000 15%,transparent);mask-image:linear-gradient(90deg,#000 15%,transparent);opacity:0;transition:opacity .4s}.about-h.is-moving .ah-pin::after{opacity:1}
.ah-track{display:flex;height:100%;will-change:transform}
.ah-panel{flex:none;height:100%;display:flex;flex-direction:column;justify-content:center;padding:0 6vw}
.ah-title{width:100vw;align-items:flex-start;text-align:left}
.about-h .ah-title .mono{font-size:24px!important;line-height:1.4}
.about-h .ah-title h2{font-family:"Geist Serif",Georgia,serif;font-size:clamp(48px,11vw,92px);font-weight:400;line-height:1.05;letter-spacing:-.03em;max-width:12ch;margin:22px 0 0;text-align:left;color:var(--ink,#102d50)}
.ah-image{width:72vw}.ah-image img{width:100%;height:68vh;object-fit:cover;border-radius:16px}
.ah-copy{width:58vw;gap:40px;align-items:flex-start}.ah-copy p{font-size:clamp(20px,2vw,28px);line-height:1.45;max-width:30ch;color:var(--ink,#102d50)}
.ah-facts{width:78vw;flex-direction:row;align-items:center;justify-content:center;gap:4vw}
.ah-fact{flex:1;max-width:30vw;padding-top:28px;border-top:1px solid #102d5026;display:flex;flex-direction:column}
.ah-fact strong{font-family:"Geist Serif",Georgia,serif;font-size:clamp(120px,15vw,240px);font-weight:400;line-height:.85;letter-spacing:-.04em;color:var(--ink,#102d50)}
.ah-fact-label{margin-top:28px;font-family:"Geist Serif",Georgia,serif;font-size:24px;color:#b54e14}
.ah-fact p{margin-top:10px;max-width:26ch;font-size:17px;line-height:1.5;color:#5c6d80}
/* People cards: gentle lift and a slow photo push-in on hover. Uses translate/scale so it doesn't fight the reveal animation's transform. */
.person{transition:translate .5s cubic-bezier(.2,.7,.2,1),box-shadow .5s}.person img{transition:scale .9s cubic-bezier(.2,.7,.2,1)}@media(hover:hover){.person:hover{translate:0 -6px;box-shadow:0 22px 40px -24px #102d5059}.person:hover img{scale:1.035}}
@media(max-width:600px){.ah-image,.ah-copy{width:88vw}.ah-image img{height:56vh}.about-h .ah-title .mono{font-size:18px!important}.ah-facts{width:100vw;flex-direction:column;justify-content:center;gap:40px}.ah-fact{flex:none;max-width:none;width:100%}.ah-fact strong{font-size:96px}.ah-fact-label{font-size:20px;margin-top:16px}.ah-fact p{font-size:15px}}
/* The last panel fills the screen at every width, so the story rests on the facts alone rather than beside a sliver of cut-off copy (the blur strip is off at rest). The pair stays a centred block instead of spreading across wide screens. */
.ah-facts{width:100vw;gap:clamp(40px,5vw,96px)}
@media(min-width:601px){.ah-fact{max-width:min(30vw,440px)}}
/* Progress line: a quiet hairline that fills as the story travels, so scrolling down reads as moving sideways. --p comes from about-hscroll.js. */
.ah-progress{position:absolute;left:6vw;bottom:calc(clamp(24px,5vh,48px) + env(safe-area-inset-bottom,0px));width:min(320px,calc(100vw - 12vw));height:2px;border-radius:2px;background:#102d501f;overflow:hidden;z-index:3;pointer-events:none}
.ah-progress span{display:block;height:100%;background:#b54e14;transform-origin:0 50%;transform:scaleX(var(--p,0))}
/* Reduced motion: no pin, no sideways travel, no blur, no progress line, just the panels stacked in normal flow. */
@media(prefers-reduced-motion:reduce){.about-h{height:auto}.ah-pin{position:static;height:auto;overflow:visible}.ah-pin::after,.ah-progress{display:none}.ah-track{display:block;height:auto;transform:none!important;will-change:auto}.ah-panel{width:auto;height:auto;padding:clamp(40px,7vw,96px) 6vw}.ah-image img{height:auto;aspect-ratio:3/2;max-height:80vh}.ah-facts{justify-content:flex-start;padding-bottom:clamp(64px,10vw,140px)}}
</style>`;
const v45Story=v45
 .replace(/<section class="about narrow section" id="about">[\s\S]*?<\/section>/,aboutStory)
 .replace(/<figure class="wide-banner[\s\S]*?<\/figure>/,'')
 .replace(/(<section class="treatments[\s\S]*?<\/section>)([\s\S]*?)(<section class="start-steps[\s\S]*?<\/section>)/,'$1$3$2')
 .replace('<img src="assets/clinician-1.jpg" alt="A smiling clinician" width="600" height="800" loading="lazy">','<img src="assets/clinician-45-1.jpg" alt="A family doctor talking with a patient over a video call at her desk" width="900" height="1200" loading="lazy">')
 .replace('<img src="assets/clinician-2.jpg" alt="A smiling doctor in a white coat" width="600" height="800" loading="lazy">','<img src="assets/clinician-45-2.jpg" alt="A psychologist listening and taking notes in a quiet, lamp-lit room" width="900" height="1200" loading="lazy">')
 .replace('<img src="assets/clinician-3.jpg" alt="A smiling clinician" width="340" height="426" loading="lazy">','<img src="assets/clinician-45-3.jpg" alt="A specialist doctor in a white coat by a window at dusk" width="900" height="1200" loading="lazy">')
 .replace('</head>',`<script type="module" src="scripts/about-hscroll.js"></script>${aboutStyles}</head>`);
if(!v45Story.includes('ah-track')||!v45Story.includes('clinician-45-3.jpg')||v45Story.includes('wide-banner')||!/id="care"[\s\S]*?<\/section><section class="start-steps/.test(v45Story))throw new Error('Design 04.5 about story or Start your care move failed');

// Patient journey: 04.5 is the homepage and links into the portal (/book, /signin, /signup under PORTAL_URL).
// design-04.js reads data-portal to turn each service dialog's button into "Book {service}".
const portal=esc(PORTAL_URL),external='https://carevia.triple-labs-8416.chatgpt.site/';
const v45Home=v45Story
 .replace('data-design="04.5"',`data-design="04.5" data-portal="${portal}"`)
 .replace('<a class="nav-pill nav-book" href="#care">Find your care</a>',`<a class="nav-pill nav-book" href="#care">Find your care</a><a class="nav-pill nav-signin" href="${portal}/signin">Sign in</a>`)
 .replace('<button class="button dark" data-all-care>View all care options</button>',`<button class="button dark" data-all-care>View all care options</button><a class="button light" href="${portal}/book?service=general" style="text-decoration:underline;text-decoration-color:#a7bdd0;text-underline-offset:4px">Not sure which one?</a>`)
 .replace(`<a class="button light" href="${external}" target="_blank" rel="noopener">Create your account</a>`,`<a class="button light" href="${portal}/signup">Create your account</a>`)
 .replace(`<a class="button dark" href="${external}#doctors" target="_blank" rel="noopener">Explore Carevia’s clinicians</a>`,'<a class="button dark" href="#care">Find your clinician</a>');
// Only the footer's and the FAQ's "Visit Carevia" keep the external site.
if(!v45Home.includes('data-portal=')||!v45Home.includes('/signin">Sign in')||!v45Home.includes('>Not sure which one?</a>')||!v45Home.includes('/signup">Create your account')||v45Home.split(external).length-1!==2)throw new Error('Design 04.5 portal links failed');
await writeFile('dist/design-04-5.html',v45Home);
await writeFile('dist/index.html',v45Home.replace('rel="canonical" href="https://carevia-glass.triple-labs-8416.chatgpt.site/design-04-5.html"','rel="canonical" href="https://carevia-glass.triple-labs-8416.chatgpt.site/"'));

console.log('Built Carevia designs 03, 04.2 and 04.5.');
