import { useEffect, useState } from 'react';
import {
  Box, Paper, Typography, TextField, Grid, Table, TableBody,
  TableCell, TableHead, TableRow, Divider,
} from '@mui/material';
import type { Account, ProjectionResult } from '../api/client';
import { getAccount, getProjection } from '../api/client';

export function Projection() {
  const [account, setAccount] = useState<Account | null>(null);

  // Trade assumptions — these drive the expected monthly P/L instead of
  // typing a flat dollar figure. Risk % and Take-Profit % are both a
  // percentage of the CURRENT balance (same convention as the Risk % on
  // the Calculator page), so "expected value per trade" scales with the
  // account exactly the way real compounding does.
  const [riskPct, setRiskPct] = useState(1);
  const [takeProfitPct, setTakeProfitPct] = useState(2);
  const [winRatePct, setWinRatePct] = useState(50);
  const [tradesPerMonth, setTradesPerMonth] = useState(20);

  const [result, setResult] = useState<ProjectionResult | null>(null);

  useEffect(() => {
    getAccount().then((a) => {
      setAccount(a);
      const defaultRisk = a.riskPerTrade * 100;
      setRiskPct(defaultRisk);
      setTakeProfitPct(defaultRisk * 2); // default to a 2:1 reward:risk
    });
  }, []);

  // Expected value per trade, as a fraction of balance:
  //   (win rate × take-profit %) − (loss rate × risk %)
  // Multiplied by trades/month and the current balance gives an expected
  // monthly $ P/L, which is exactly what the compounding projection below
  // already expects as its "Avg Monthly P/L" input.
  const winFrac = winRatePct / 100;
  const lossFrac = 1 - winFrac;
  const expectedValuePerTrade = winFrac * (takeProfitPct / 100) - lossFrac * (riskPct / 100);
  const estMonthlyPnL = account ? account.currentBalance * expectedValuePerTrade * tradesPerMonth : 0;

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    const run = async () => {
      if (estMonthlyPnL <= 0) {
        if (!cancelled) setResult(null);
        return;
      }
      const r = await getProjection(estMonthlyPnL);
      if (!cancelled) setResult(r);
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, riskPct, takeProfitPct, winRatePct, tradesPerMonth]);

  const field = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    suffix?: string
  ) => (
    <TextField
      fullWidth
      label={suffix ? `${label} (${suffix})` : label}
      type="number"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      sx={{ mb: 2 }}
    />
  );

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Projection to $1,000,000
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Assumes 30% of monthly profit withdrawn, 70% compounded back into capital.
        Expected monthly P/L is derived from your risk and take-profit assumptions below,
        not typed in directly.
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Trade Assumptions</Typography>
            {field('Risk per Trade', riskPct, setRiskPct, '% of balance')}
            {field('Take-Profit per Trade', takeProfitPct, setTakeProfitPct, '% of balance')}
            {field('Win Rate', winRatePct, setWinRatePct, '%')}
            {field('Trades per Month', tradesPerMonth, setTradesPerMonth)}

            <Divider sx={{ my: 2 }} />

            <Typography variant="caption" color="text.secondary">
              REWARD : RISK
            </Typography>
            <Typography variant="h6" sx={{ mb: 2 }}>
              {riskPct > 0 ? `${(takeProfitPct / riskPct).toFixed(2)} : 1` : '—'}
            </Typography>

            <Typography variant="caption" color="text.secondary">
              EST. MONTHLY P/L (at current balance)
            </Typography>
            <Typography
              variant="h5"
              color={estMonthlyPnL >= 0 ? 'success.main' : 'error.main'}
              sx={{ mb: 2 }}
            >
              {estMonthlyPnL >= 0 ? '+' : ''}${estMonthlyPnL.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </Typography>

            {result && (
              <>
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    MONTHS TO $1M
                  </Typography>
                  <Typography variant="h3" color="primary.main">
                    {result.monthsToTarget ?? 'N/A'}
                  </Typography>
                </Box>
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    YEARS
                  </Typography>
                  <Typography variant="h5">
                    {result.yearsToTarget ?? 'N/A'}
                  </Typography>
                </Box>
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    TOTAL WITHDRAWN EN ROUTE
                  </Typography>
                  <Typography variant="h5" color="success.main">
                    ${result.totalWithdrawn.toLocaleString()}
                  </Typography>
                </Box>
              </>
            )}
            {!result && estMonthlyPnL <= 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                With a win rate this low relative to your reward:risk, the expected
                monthly P/L is zero or negative — adjust the assumptions above.
              </Typography>
            )}
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Paper sx={{ maxHeight: 500, overflow: 'auto' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Month</TableCell>
                  <TableCell align="right">Start</TableCell>
                  <TableCell align="right">P/L</TableCell>
                  <TableCell align="right">Withdraw</TableCell>
                  <TableCell align="right">End Balance</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {result?.schedule.slice(0, 120).map((m) => (
                  <TableRow key={m.month}>
                    <TableCell>{m.month}</TableCell>
                    <TableCell align="right">
                      ${m.start.toLocaleString()}
                    </TableCell>
                    <TableCell align="right" sx={{ color: 'success.main' }}>
                      +${m.pnl.toLocaleString()}
                    </TableCell>
                    <TableCell align="right" sx={{ color: 'warning.main' }}>
                      -${m.withdrawal.toLocaleString()}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      ${m.end.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
