import { useState } from 'react';
import { Box, Paper, Typography, TextField, Grid } from '@mui/material';
import { getTaxEstimate } from '../api/client';

export function TaxCenter() {
  const [profit, setProfit] = useState(10000);
  const [result, setResult] = useState<{ tax: number; effectiveRate: number } | null>(null);

  const calc = async (v: number) => {
    setProfit(v);
    const r = await getTaxEstimate(v);
    setResult({ tax: r.tax, effectiveRate: r.effectiveRate });
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Tax Center</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        SARS 2026/27 income tax estimate. Trading profit is treated as revenue — taxed at your marginal rate.
      </Typography>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Annual Profit Calculator</Typography>
            <TextField
              fullWidth
              label="Annual Trading Profit ($)"
              type="number"
              value={profit}
              onChange={(e) => calc(parseFloat(e.target.value) || 0)}
              sx={{ mb: 3 }}
            />
            {result && (
              <>
                <Typography variant="caption" color="text.secondary">
                  ESTIMATED TAX
                </Typography>
                <Typography variant="h3" color="error.main">
                  ${result.tax.toFixed(2)}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                  Effective rate: {(result.effectiveRate * 100).toFixed(2)}%
                </Typography>
              </>
            )}
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>SARS 2026/27 Brackets</Typography>
            {[
              ['R0 – R245,100', '18%'],
              ['R245,101 – R383,100', '26%'],
              ['R383,101 – R530,200', '31%'],
              ['R530,201 – R695,800', '36%'],
              ['R695,801 – R887,000', '39%'],
              ['R887,001 – R1,878,600', '41%'],
              ['R1,878,601+', '45%'],
            ].map(([band, rate]) => (
              <Box
                key={band}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  py: 1,
                  borderBottom: '1px solid #21262D',
                }}
              >
                <Typography variant="body2">{band}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{rate}</Typography>
              </Box>
            ))}
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mt: 2, display: 'block' }}
            >
              Primary rebate: R17,820
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}