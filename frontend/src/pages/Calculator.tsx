import { useEffect, useState } from 'react';
import {
  Box, Paper, Typography, TextField, Grid, Table, TableBody,
  TableCell, TableHead, TableRow,
} from '@mui/material';
import type { Account, LotSizingResult } from '../api/client';
import { getAccount, calcLotSize } from '../api/client';
import { useGoldPrice } from '../hooks/useGoldPrice';
export function Calculator() {
  const [account, setAccount] = useState<Account | null>(null);
  const [slPoints, setSlPoints] = useState(20);
  const [riskPct, setRiskPct] = useState(10);
  const [result, setResult] = useState<LotSizingResult | null>(null);
  const { price: livePrice } = useGoldPrice();

  useEffect(() => {
    getAccount().then((a) => {
      setAccount(a);
      setRiskPct(a.riskPerTrade * 100);
    });
  }, []);

  useEffect(() => {
    if (slPoints > 0) {
      calcLotSize(slPoints, riskPct / 100).then(setResult).catch(() => {});
    }
  }, [slPoints, riskPct]);

  if (!account) return null;

  const pointsTable = [1, 5, 10, 20, 50, 100, 200];

  return (
    <Box>
      {/* Fix: Replace 'mb={3}' with sx */}
      <Typography variant="h4" gutterBottom>Lot Size Calculator</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        XAUUSD position sizing — auto-calculated from your live account balance.
      </Typography>

      {/* Fix: Use size={{}} prop for Grid */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 5 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Inputs</Typography>
            {/* Fix: Use slotProps.input for readOnly */}
            <TextField
              fullWidth
              label="Account Balance"
              value={`$${account.currentBalance.toFixed(2)}`}
              slotProps={{ input: { readOnly: true } }}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="Risk %"
              type="number"
              value={riskPct}
              onChange={(e) => setRiskPct(parseFloat(e.target.value) || 0)}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="Stop Loss Distance ($ move on gold)"
              type="number"
              value={slPoints}
              onChange={(e) => setSlPoints(parseFloat(e.target.value) || 0)}
            />
          </Paper>

          <Paper sx={{ p: 3, mt: 2 }}>
            {/* Fix: Replace 'mb={2}' with sx */}
            <Typography variant="h6" sx={{ mb: 2 }}>Points → $ P/L</Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Points</TableCell>
                  <TableCell align="right">P/L</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pointsTable.map((p) => (
                  <TableRow key={p}>
                    <TableCell>{p}</TableCell>
                    <TableCell align="right">
                      ${result ? (result.dollarPerPoint * p).toFixed(2) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </Grid>

        {/* Fix: Use size={{}} prop for Grid */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Result</Typography>
            {livePrice && (
            <Box
            sx={{
             mb: 2,
              p: 1.5,
               borderRadius: 1,
                bgcolor: 'rgba(255,193,7,0.08)',
                }}
                >
    <Typography variant="caption" color="text.secondary">
      LIVE XAU/USD
    </Typography>
    <Typography variant="h6" sx={{ color: '#FFC107' }}>
      ${livePrice.price.toFixed(2)}
    </Typography>
  </Box>
)}
            {result && (
              <Grid container spacing={3}>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption" color="text.secondary">LOT SIZE</Typography>
                  {/* Fix: 'h3' is valid, but ensure no system props are passed */}
                  <Typography variant="h3" color="primary.main">{result.lot}</Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption" color="text.secondary">$ RISKED</Typography>
                  <Typography variant="h3" color="error.main">${result.riskedUSD.toFixed(2)}</Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption" color="text.secondary">$ PER 1 POINT</Typography>
                  <Typography variant="h5">${result.dollarPerPoint.toFixed(2)}</Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption" color="text.secondary">CONTRACT SIZE</Typography>
                  <Typography variant="h5">{result.contractSize} oz/lot</Typography>
                </Grid>
              </Grid>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}