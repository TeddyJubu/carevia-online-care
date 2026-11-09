// Orange specular rim on the Design 04.5 homepage (engine in specular-rim.js; the apps use the same module).
// Every button on the page gets the rim, not just the nav pills (the selector is shared with build.mjs's hover CSS).
import { rim } from './specular-rim.js';

rim('.topbar .nav-pill, .hero .search-shell, .button, .film-toggle, .dialog-close, .menu-main');
