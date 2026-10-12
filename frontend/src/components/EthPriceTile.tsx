import { useEthPrice } from '../hooks/useEthPrice';
import { PriceTile } from './PriceTile';

export function EthPriceTile() {
  const { price, error } = useEthPrice();

  return (
    <PriceTile
      label="Live ETH · ETH/USD"
      accent="#6B4FD6"
      price={price?.price}
      updatedAt={price?.updatedAt}
      sentiment={price?.sentiment}
      error={error}
    />
  );
}
