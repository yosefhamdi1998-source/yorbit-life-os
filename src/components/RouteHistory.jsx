import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { recordRoute } from '@/lib/routeHistory';

export default function RouteHistory() {
  const { pathname, search, hash, key } = useLocation();
  const navigationType = useNavigationType();
  useEffect(() => {
    recordRoute(`${pathname}${search}${hash}`, key, navigationType);
  }, [pathname, search, hash, key, navigationType]);
  return null;
}
