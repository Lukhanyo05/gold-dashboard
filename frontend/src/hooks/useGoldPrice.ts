import { useEffect, useState } from 'react';
import { getGoldPrice, type GoldPrice } from '../api/client';

export function useGoldPrice(intervalMs = 10000) {
  const [price, setPrice] = useState<GoldPrice | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchPrice = async () => {
      try {
        const p = await getGoldPrice();
        if (!cancelled) {
          setPrice(p);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          const err = e as { message?: string };
          setError(err?.message ?? 'Failed to fetch price');
        }
      }
    };

    fetchPrice();
    const id = setInterval(fetchPrice, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  return { price, error };
}