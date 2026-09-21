import { Paper, Typography, Box, Skeleton, Chip } from '@mui/material';
import { useGoldPrice } from '../hooks/useGoldPrice';

export function GoldPriceTile() {
  const { price, error } = useGoldPrice();

  return (
    <Paper sx={{ p: 2.5, position: 'relative', overflow: 'hidden' }}>
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          bgcolor: '#FFC107',
        }}
      />
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 1,
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ textTransform: 'uppercase', letterSpacing: 1 }}
        >
          Live Gold · XAU/USD
        </Typography>
        <Chip
          label={error ? 'OFFLINE' : 'LIVE'}
          size="small"
          color={error ? 'error' : 'success'}
          sx={{ height: 20, fontSize: 10 }}
        />
      </Box>

      {price ? (
        <>
          <Typography
            variant="h4"
            sx={{ color: '#FFC107', fontWeight: 700 }}
          >
            ${price.price.toFixed(2)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Updated {new Date(price.updatedAt).toLocaleTimeString()}
          </Typography>
        </>
      ) : (
        <Skeleton variant="text" width="60%" height={60} />
      )}
    </Paper>
  );
}