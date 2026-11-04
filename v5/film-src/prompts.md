# v5 films: how they were made

Generated on fal.ai on 5 November 2026. Each film loops seamlessly because the same keyframe is passed as the first and the last frame.

## Night (hero)

1. Keyframe `night-keyframe.jpg` from `bytedance/seedream/v5/pro/text-to-image`, 2560×1440:

   > Cinematic 35mm film still, wide shot inside a calm Lisbon apartment at blue hour. Seen from behind, a woman wrapped in a soft oatmeal wool blanket sits on a low linen sofa in the lower right third of the frame, a laptop on her knees softly glowing with a blurred video call with a doctor. A tall window fills the center of the frame with sheer white linen curtains gently lifting in the evening breeze; outside, a deep cobalt dusk sky over terracotta rooftops with a few warm lit windows. A small brass lamp casts a warm amber pool of light on the left. Deep navy shadows, wide calm negative space in the upper center, quiet and intimate mood, soft volumetric light, natural fabric textures, fine film grain, muted teal and amber palette, anamorphic lens, photorealistic, no text, no logos.

2. Motion from `kling/v4/image-to-video` with `start_image_url` = `end_image_url` = the keyframe, 10 s at 1080p:

   > Locked-off static camera, absolutely no camera movement. A quiet blue-hour evening in a Lisbon apartment: the sheer linen curtain on the left slowly billows inward on a gentle breeze and softly settles back; the curtain on the right sways slightly. The woman wrapped in the wool blanket breathes calmly and gives a small nod while talking on the video call; the laptop screen glows softly. Distant city windows twinkle. Calm, slow, graceful, realistic motion, cinematic 24fps film look.

3. Grade: `OVERLAY=grad-nd.png ./film.sh night-kling4.mp4 ../public/film night "curves=master='0/0 0.5/0.44 0.8/0.62 1/0.72',eq=saturation=1.08"`. The curve and the graduated ND layer keep the nav and subtext legible without a CSS overlay.

## Morning (closing)

1. Keyframe `morning-keyframe.jpg` from `bytedance/seedream/v5/pro/edit`, using the night keyframe as the reference:

   > Same room, same camera angle and exact same composition, the next morning just after sunrise. Soft golden morning sunlight streams through the window and the sheer linen curtains glow warm and translucent; a pale peach and light blue morning sky over the Lisbon terracotta rooftops. The window seat is now empty: the oatmeal wool blanket is neatly folded and the laptop is closed beside a ceramic cup of coffee. The lamp is off. Calm, rested, hopeful mood, gentle warm light on the walls, same cinematic 35mm film grain, photorealistic.

2. Motion from `kling/v4/image-to-video`, first frame = last frame, 10 s at 1080p:

   > Locked-off static camera, absolutely no camera movement. The next morning just after sunrise in a Lisbon apartment: the sheer linen curtains gently billow inward on a soft morning breeze and settle back, glowing with warm golden sunlight; thin wisps of steam rise slowly from the cup of coffee on the empty window seat; soft sunlight shimmers across the cushions. Calm, slow, peaceful, realistic motion, cinematic 24fps film look.

3. Grade: `./film.sh morning-kling4.mp4 ../public/film morning "eq=saturation=1.03"`.

Also tried: Luma Ray 3.2 with `loop: true`. The camera drifted and the loop seam was visible, with SSIM 0.89 between the first and last frames against 0.98 for Kling.
