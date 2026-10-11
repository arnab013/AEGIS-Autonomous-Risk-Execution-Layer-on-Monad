import { useEffect, useState } from 'react';

export type AppRoute = '/' | '/app' | '/app/workspace';

export function readRoute(path = window.location.pathname): AppRoute {
  if (path === '/app/workspace' || path === '/app/workspace/') return '/app/workspace';
  if (path === '/app' || path === '/app/') return '/app';
  return '/';
}

export function useAppRoute() {
  const [route, setRoute] = useState<AppRoute>(readRoute);
  useEffect(() => {
    const update = () => setRoute(readRoute());
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  function navigate(next: AppRoute) {
    if (window.location.pathname !== next) window.history.pushState(null, '', next);
    setRoute(next);
    window.scrollTo({ top: 0 });
  }
  return { route, navigate };
}
