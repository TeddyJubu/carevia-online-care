// Paper "Heatmap" shader (vendored @paper-design/shaders 0.0.82, Apache-2.0) with the settings from the Carevia Paper file.
import {ShaderMount} from './vendor/paper-shaders/shader-mount.js?v=a2d47525d7';
import {heatmapFragmentShader,toProcessedHeatmap} from './vendor/paper-shaders/shaders/heatmap.js?v=a2d47525d7';
import {getShaderColorFromString as color} from './vendor/paper-shaders/get-shader-color-from-string.js?v=a2d47525d7';
import {ShaderFitOptions} from './vendor/paper-shaders/shader-sizing.js?v=a2d47525d7';

const colors=['#11206A','#1F3BA2','#2F63E7','#6BD7FF','#FFE679','#FF991E','#FF4C00'];

export async function mountHeatmap(el){
 const {blob}=await toProcessedHeatmap(el.dataset.heatmap);
 const image=new Image();image.src=URL.createObjectURL(blob);await image.decode();
 const still=matchMedia('(prefers-reduced-motion: reduce)').matches;
 new ShaderMount(el,heatmapFragmentShader,{
  u_image:image,u_contour:.5,u_angle:0,u_noise:0,u_innerGlow:.5,u_outerGlow:.5,
  u_colorBack:color('#00000000'),u_colors:colors.map(color),u_colorsCount:colors.length,
  u_fit:ShaderFitOptions.contain,u_scale:.75,u_rotation:0,u_offsetX:0,u_offsetY:0,u_originX:.5,u_originY:.5,u_worldWidth:0,u_worldHeight:0
 },undefined,still?0:1,21901.5,2,undefined,['u_image']);
 el.classList.add('is-live');
}
