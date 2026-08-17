'use strict';
(() => {
  function loadStyle(href) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.onerror = () => console.error(`YWD-Hotspot failed to load ${href}`);
    document.head.appendChild(l);
  }
  function load(src, next) {
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = () => next && next();
    s.onerror = () => console.error(`YWD-Hotspot failed to load ${src}`);
    document.head.appendChild(s);
  }
  loadStyle('/ui-polish.css?v=alpha10');
  load('/app-core.js', () => load('/talkgroups.js', () => load('/ui-polish.js?v=alpha10', () => load('/terminal.js'))));
})();
