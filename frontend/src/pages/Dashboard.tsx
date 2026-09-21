import { useEffect, useState } from 'react';
import {
  Box, Grid, Paper, Typography, CircularProgress, Alert, LinearProgress,
} from '@mui/material';
import { StatCard } from '../components/StatCard';
import { EquityChart } from '../components/EquityChart';
import type { Account, Trade } from '../api/client';
import { getAccount, getTrades, getProjection } from '../api/client';
import { GoldPriceTile } from '../components/GoldPriceTile';


export function Dashboard() {
  const [account, setAccount] = useState<Account | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [months, setMonths] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getAccount(), getTrades()])
      .then(([a, t]) => {
        setAccount(a);
        setTrades(t);
        const avgPL = 50;
        return getProjection(avgPL);
      })
      .then((p) => setMonths(p.monthsToTarget))
      .catch((e) => {
        const err = e as { message?: string };
        setError(err?.message ?? 'Failed to load dashboard');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!account) return null;

  const pctToTarget = Math.min(100, (account.currentBalance / account.targetBalance) * 100);
  const netGrowth = account.currentBalance - account.startingBalance;
  const totalTrades = trades.length;
  const closed = trades.filter((t) => t.result !== 'Open');
  const wins = closed.filter((t) => t.result === 'Win').length;
  const winRate = closed.length ? (wins / closed.length) * 100 : 0;

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Dashboard</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Live snapshot of your trading company capital.
      </Typography>

            <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <GoldPriceTile />
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            label="Current Balance"
            value={`$${account.currentBalance.toFixed(2)}`}
            sub={`Started at $${account.startingBalance.toFixed(2)}`}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            label="Net Growth"
            value={`$${netGrowth.toFixed(2)}`}
            sub={`${((netGrowth / account.startingBalance) * 100).toFixed(1)}%`}
            accent={netGrowth >= 0 ? '#4CAF50' : '#E53935'}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            label="Tax Reserve"
            value={`$${account.taxReserve.toFixed(2)}`}
            sub={`Rate: ${(account.taxRate * 100).toFixed(0)}%`}
            accent="#4A90E2"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            label="Months to $1M"
            value={months != null ? months : 'N/A'}
            sub={months != null ? `~${(months / 12).toFixed(1)} years` : 'Add monthly P/L'}
            accent="#D4AF37"
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Equity Curve</Typography>
            <EquityChart trades={trades} startingBalance={account.startingBalance} />
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Progress to $1M</Typography>
            <Typography variant="h3" color="primary.main" sx={{ fontWeight: 700 }}>
              {pctToTarget.toFixed(3)}%
            </Typography>
            <LinearProgress
              variant="determinate"
              value={pctToTarget}
              sx={{ mt: 2, height: 8, borderRadius: 4 }}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              ${(account.targetBalance - account.currentBalance).toLocaleString()} remaining
            </Typography>

            <Box sx={{ mt: 4 }}>
              <Typography variant="subtitle2" color="text.secondary">Trades Logged</Typography>
              <Typography variant="h5">{totalTrades}</Typography>

              <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2 }}>Win Rate</Typography>
              <Typography variant="h5">{winRate.toFixed(1)}%</Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}