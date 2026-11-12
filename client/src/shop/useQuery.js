import { useSearchParams } from 'react-router-dom';

export function useQuery() {
  const [sp] = useSearchParams();
  return Object.fromEntries(sp.entries());
}
