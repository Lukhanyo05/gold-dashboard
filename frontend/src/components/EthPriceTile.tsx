import { useEthPrice } from '../hooks/useEthPrice';
import { PriceTile } from './PriceTile';

export function EthPriceTile() {
  const { price, error } = useEthPrice();

  return (
    <PriceTile
      label="Live ETH · ETH/USD"
      accent="#8A6DFF"
      price={price?.price}
      updatedAt={price?.updatedAt}
      sentiment={price?.sentiment}
      error={error}
    />
  );
}
