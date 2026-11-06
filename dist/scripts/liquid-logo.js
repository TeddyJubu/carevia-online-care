// Paper "LiquidMetal" nav logo (vendored @paper-design/shaders 0.0.82, Apache-2.0), settings from the Carevia Paper file.
// The white PNG mark stays in place until the shader is ready, so the logo never blinks out or breaks without WebGL.
// ponytail: no pause code here. ShaderMount already drops to speed 0 (no rAF) while the tab is hidden or the logo is off screen,
// and reduced motion passes speed 0, which renders one still frame.
import {ShaderMount} from './vendor/paper-shaders/shader-mount.js?v=2949667b8d';
import {liquidMetalFragmentShader,toProcessedLiquidMetal,LiquidMetalShapes} from './vendor/paper-shaders/shaders/liquid-metal.js?v=2949667b8d';
import {ShaderFitOptions,defaultObjectSizing as s} from './vendor/paper-shaders/shader-sizing.js?v=2949667b8d';
import {getShaderColorFromString as color} from './vendor/paper-shaders/get-shader-color-from-string.js?v=2949667b8d';

const logo=document.querySelector('.topbar .nav-logo');
if(logo){
  try{
    const {pngBlob}=await toProcessedLiquidMetal('assets/carevia-mark-metal.webp');
    const image=new Image();image.src=URL.createObjectURL(pngBlob);await image.decode();
    const stage=document.createElement('span');stage.className='liquid-logo';stage.setAttribute('aria-hidden','true');logo.append(stage);
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mount=new ShaderMount(stage,liquidMetalFragmentShader,{
      u_colorBack:color('#00000000'),u_colorTint:color('#FFFFFF'),u_image:image,u_isImage:true,
      u_contour:.4,u_distortion:.07,u_softness:.1,u_repetition:2,u_shiftRed:.3,u_shiftBlue:.3,u_angle:70,
      u_shape:LiquidMetalShapes.diamond,u_fit:ShaderFitOptions[s.fit],u_scale:.6,u_rotation:0,
      u_offsetX:s.offsetX,u_offsetY:s.offsetY,u_originX:s.originX,u_originY:s.originY,u_worldWidth:s.worldWidth,u_worldHeight:s.worldHeight
    },undefined,reduced?0:1,401022.7,2,undefined,['u_image']);
    // A shader that fails to compile does not throw, so check before hiding the PNG.
    if(!mount.program){mount.dispose();throw new Error('shader program failed')}
    logo.classList.add('is-metal');
  }catch(error){document.querySelector('.topbar .liquid-logo')?.remove();console.warn('Liquid metal logo unavailable; keeping the static mark.',error)}
}
