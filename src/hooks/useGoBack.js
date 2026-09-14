import { useNavigate } from 'react-router-dom';
import { previousRoute } from '@/lib/routeHistory';

export default function useGoBack(fallback = '/') {
  const navigate = useNavigate();
  return () => previousRoute() ? navigate(-1) : navigate(fallback, { replace: true });
}
