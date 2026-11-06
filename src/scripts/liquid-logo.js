// Paper "Heatmap" nav logo (vendored @paper-design/shaders 0.0.82, Apache-2.0), settings from the Carevia Paper file (6 Nov 2026).
// The white PNG mark stays in place until the shader is ready, so the logo never blinks out or breaks without WebGL.
// ponytail: no pause code here. ShaderMount already drops to speed 0 (no rAF) while the tab is hidden or the logo is off screen,
// and reduced motion passes speed 0, which renders one still frame.
import {ShaderMount} from './vendor/paper-shaders/shader-mount.js';
import {heatmapFragmentShader,toProcessedHeatmap} from './vendor/paper-shaders/shaders/heatmap.js';
import {ShaderFitOptions} from './vendor/paper-shaders/shader-sizing.js';
import {getShaderColorFromString as color} from './vendor/paper-shaders/get-shader-color-from-string.js';

const colors=['#11206A','#1F3BA2','#2F63E7','#6BD7FF','#FFE679','#FF991E','#FF4C00'];
const logo=document.querySelector('.topbar .nav-logo');
if(logo){
  try{
    const {blob}=await toProcessedHeatmap('assets/carevia-mark-heatmap.webp');
    const image=new Image();image.src=URL.createObjectURL(blob);await image.decode();
    const stage=document.createElement('span');stage.className='liquid-logo';stage.setAttribute('aria-hidden','true');logo.append(stage);
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mount=new ShaderMount(stage,heatmapFragmentShader,{
      u_image:image,u_contour:.505,u_angle:0,u_noise:0,u_innerGlow:.41,u_outerGlow:.5,
      u_colorBack:color('#00000000'),u_colors:colors.map(color),u_colorsCount:colors.length,
      u_fit:ShaderFitOptions.contain,u_scale:.75,u_rotation:0,u_offsetX:0,u_offsetY:0,u_originX:.5,u_originY:.5,u_worldWidth:0,u_worldHeight:0
    },undefined,reduced?0:1,455946.75,2,undefined,['u_image']);
    // A shader that fails to compile does not throw, so check before hiding the PNG.
    if(!mount.program){mount.dispose();throw new Error('shader program failed')}
    logo.classList.add('is-metal');
  }catch(error){document.querySelector('.topbar .liquid-logo')?.remove();console.warn('Heatmap logo unavailable; keeping the static mark.',error)}
}
