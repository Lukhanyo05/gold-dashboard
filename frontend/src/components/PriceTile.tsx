import { Paper, Typography, Box, Skeleton, Chip } from '@mui/material';
import type { Sentiment } from '../api/client';

interface Props {
  label: string;
  accent: string;
  price: number | null | undefined;
  updatedAt: string | null | undefined;
  sentiment: Sentiment | null | undefined;
  error: string | null;
  decimals?: number;
}

const sentimentColor = (label: Sentiment['label']): 'success' | 'error' | 'default' => {
  if (label === 'Bullish') return 'success';
  if (label === 'Bearish') return 'error';
  return 'default';
};

export function PriceTile({
  label,
  accent,
  price,
  updatedAt,
  sentiment,
  error,
  decimals = 2,
}: Props) {
  return (
    <Paper sx={{ p: 2.5, position: 'relative', overflow: 'hidden' }}>
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          bgcolor: accent,
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
          {label}
        </Typography>
        <Chip
          label={error ? 'OFFLINE' : 'LIVE'}
          size="small"
          color={error ? 'error' : 'success'}
          sx={{ height: 20, fontSize: 10 }}
        />
      </Box>

      {price != null ? (
        <>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="h4" sx={{ color: accent, fontWeight: 700 }}>
              ${price.toFixed(decimals)}
            </Typography>
            {sentiment && (
              <Chip
                size="small"
                label={`${sentiment.label} ${sentiment.changePercent > 0 ? '+' : ''}${sentiment.changePercent}%`}
                color={sentimentColor(sentiment.label)}
                variant="outlined"
              />
            )}
          </Box>
          <Typography variant="caption" color="text.secondary">
            {updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString()}` : ''}
            {sentiment ? ` · momentum over ${sentiment.windowMinutes}m` : ''}
          </Typography>
        </>
      ) : (
        <Skeleton variant="text" width="60%" height={60} />
      )}
    </Paper>
  );
}
