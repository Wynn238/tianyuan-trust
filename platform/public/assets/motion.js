/* 全站入场与微动效：GSAP 只做首屏入场，滚动内容保持静止 */
(function () {
  'use strict';
  if (!window.gsap) return;

  var gsap = window.gsap;
  gsap.defaults({ ease: 'power3.out' });

  var hero = document.querySelector('[data-enter]');
  if (!hero) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduce && reduce.matches) {
    hero.classList.add('is-entered');
    return;
  }

  var h1 = hero.querySelector('h1');
  var lines = [];
  if (h1 && !h1.dataset.split) {
    var parts = h1.innerHTML.split(/<br\s*\/?>/i);
    h1.innerHTML = parts.map(function (line) {
      return '<span class="m-line"><span class="m-line__in">' + (line || '&nbsp;') + '</span></span>';
    }).join('');
    h1.dataset.split = '1';
    lines = Array.prototype.slice.call(h1.querySelectorAll('.m-line__in'));
  }

  var fades = Array.prototype.slice.call(hero.querySelectorAll(
    '.hero-logo-link,.hero-search-row,.hero-split__sub,.hero-split__actions,.hero-split__proof,.film-kicker,.film-lede,.film-meta,.shop-searchbar,.shop-hot,.shop-promise'
  ));
  var media = hero.querySelector('.hero-media,.film-frame');

  if (lines.length) gsap.set(lines, { yPercent: 110 });
  if (fades.length) gsap.set(fades, { autoAlpha: 0, y: 12 });
  if (media) gsap.set(media, { scale: 0.985 });

  var tl = gsap.timeline({
    onComplete: function () { hero.classList.add('is-entered'); },
  });

  if (lines.length) {
    tl.to(lines, { yPercent: 0, duration: 0.7, stagger: 0.08 }, 0.05);
  }
  if (media) {
    tl.to(media, { scale: 1, duration: 0.95, ease: 'power2.out' }, 0.05);
  }
  if (fades.length) {
    tl.to(fades, { autoAlpha: 1, y: 0, duration: 0.52, stagger: 0.06 }, lines.length ? 0.55 : 0.15);
  }
})();
