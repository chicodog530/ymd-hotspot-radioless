'use strict';
(() => {
  function load(src, next) {
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = () => next && next();
    s.onerror = () => console.error(`YWD-Hotspot failed to load ${src}`);
    document.head.appendChild(s);
  }
  load('/app-core.js', () => load('/talkgroups.js', () => load('/ui-polish.js')));
})();
