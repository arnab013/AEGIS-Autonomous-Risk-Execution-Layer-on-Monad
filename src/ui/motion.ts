import { useEffect } from 'react';
import type { AppRoute } from './routes.ts';

const targets = [
  '.landing-hero-copy > *',
  '.landing-principle',
  '.landing-proof',
  '.landing-section-heading',
  '.landing-problem-grid > article',
  '.landing-steps > article',
  '.landing-product-preview',
  '.landing-capabilities > article',
  '.landing-scope',
  '.landing-final-cta',
  '.dashboard-topbar',
  '.dashboard-context',
  '.dashboard-metric',
  '.dashboard-work-grid > *',
  '.dashboard-bottom-grid > *',
  '.agent-message',
  '.agent-intent',
  '.workspace-intro',
  '.workspace-grid > *',
  '.mandate',
  '.journal-card',
].join(',');

export function usePageMotion(route: AppRoute) {
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const observed = new Set<HTMLElement>();
    let frame = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.08 }
    );
    const scan = () => {
      frame = 0;
      for (const node of document.querySelectorAll<HTMLElement>(targets)) {
        if (observed.has(node)) continue;
        observed.add(node);
        node.classList.add('motion-reveal');
        const index = node.parentElement ? [...node.parentElement.children].indexOf(node) : 0;
        node.style.setProperty('--reveal-delay', `${Math.min(index * 55, 180)}ms`);
        if (preference.matches) node.classList.add('is-visible');
        else observer.observe(node);
      }
    };
    const refresh = () => {
      if (!frame) frame = requestAnimationFrame(scan);
    };
    const mutations = new MutationObserver(refresh);
    // Observe added content, rather than prices changing every second.
    mutations.observe(document.getElementById('root')!, { childList: true, subtree: true });
    const reduce = () => {
      if (!preference.matches) return;
      observer.disconnect();
      observed.forEach((node) => node.classList.add('is-visible'));
    };
    preference.addEventListener('change', reduce);
    scan();
    return () => {
      observer.disconnect();
      mutations.disconnect();
      cancelAnimationFrame(frame);
      preference.removeEventListener('change', reduce);
    };
  }, [route]);
}
