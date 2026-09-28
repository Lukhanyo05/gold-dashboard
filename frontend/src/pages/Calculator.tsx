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
  const [tpPoints, setTpPoints] = useState(40);
  const [riskPct, setRiskPct] = useState(10);
  const [winRatePct, setWinRatePct] = useState(50);
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

  // Reward/risk math — this is the "best profit" side of the calculator:
  // given the SL/TP distances above, how does the trade's risk:reward
  // actually stack up, and what win rate do you need just to break even?
  const rewardUSD = result ? result.dollarPerPoint * tpPoints : 0;
  const riskedUSD = result ? result.riskedUSD : 0;
  const rrRatio = slPoints > 0 ? tpPoints / slPoints : 0;
  // breakeven win rate: winRate * reward = (1 - winRate) * risk
  //   => winRate = risk / (risk + reward)
  const breakevenWinRatePct =
    riskedUSD + rewardUSD > 0 ? (riskedUSD / (riskedUSD + rewardUSD)) * 100 : 0;
  const winFrac = winRatePct / 100;
  const expectedValueUSD = winFrac * rewardUSD - (1 - winFrac) * riskedUSD;
  const edgeVsBreakeven = winRatePct - breakevenWinRatePct;

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
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="Take Profit Distance ($ move on gold)"
              type="number"
              value={tpPoints}
              onChange={(e) => setTpPoints(parseFloat(e.target.value) || 0)}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="Expected Win Rate (%)"
              type="number"
              value={winRatePct}
              onChange={(e) => setWinRatePct(parseFloat(e.target.value) || 0)}
              helperText="Your actual win rate for this setup — used to estimate expected value"
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

          {result && (
            <Paper sx={{ p: 3, mt: 2 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>Risk vs. Reward</Typography>
              <Grid container spacing={3}>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption" color="text.secondary">REWARD:RISK</Typography>
                  <Typography
                    variant="h4"
                    color={rrRatio >= 2 ? 'success.main' : rrRatio >= 1 ? 'warning.main' : 'error.main'}
                  >
                    {rrRatio.toFixed(2)} : 1
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption" color="text.secondary">$ POTENTIAL REWARD</Typography>
                  <Typography variant="h4" color="success.main">${rewardUSD.toFixed(2)}</Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption" color="text.secondary">BREAKEVEN WIN RATE</Typography>
                  <Typography variant="h5">{breakevenWinRatePct.toFixed(1)}%</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Win at least this often just to avoid losing money
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography variant="caption" color="text.secondary">
                    EXPECTED VALUE / TRADE (at {winRatePct}% win rate)
                  </Typography>
                  <Typography
                    variant="h5"
                    color={expectedValueUSD >= 0 ? 'success.main' : 'error.main'}
                  >
                    {expectedValueUSD >= 0 ? '+' : ''}${expectedValueUSD.toFixed(2)}
                  </Typography>
                  <Typography variant="caption" color={edgeVsBreakeven >= 0 ? 'success.main' : 'error.main'}>
                    {edgeVsBreakeven >= 0 ? '+' : ''}
                    {edgeVsBreakeven.toFixed(1)}pts vs. breakeven win rate
                  </Typography>
                </Grid>
              </Grid>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                {rrRatio >= 2
                  ? 'Good reward:risk — even a sub-50% win rate can be profitable here.'
                  : rrRatio >= 1
                  ? 'Even reward:risk — you need a win rate above 50% to be profitable long-term.'
                  : 'Poor reward:risk — you are risking more than you stand to gain. Consider widening your take profit or tightening your stop.'}
              </Typography>
            </Paper>
          )}
        </Grid>
      </Grid>
    </Box>
  );
}