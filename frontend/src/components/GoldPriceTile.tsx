import { useGoldPrice } from '../hooks/useGoldPrice';
import { PriceTile } from './PriceTile';

export function GoldPriceTile() {
  const { price, error } = useGoldPrice();

  return (
    <PriceTile
      label="Live Gold · XAU/USD"
      accent="#D9B35C"
      price={price?.price}
      updatedAt={price?.updatedAt}
      sentiment={price?.sentiment}
      error={error}
    />
  );
}
