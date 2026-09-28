import { useEffect, useState } from 'react';
import {
  Box, Typography, Grid, Paper, TextField, MenuItem, CircularProgress, Alert,
  Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar,
} from 'recharts';
import type { AnalyticsSummary, TradeSymbol, CoreStats, AnalyticsInsights } from '../api/client';
import { getAnalyticsSummary, getRollingStats, getAnalyticsInsights } from '../api/client';
import { StatCard } from '../components/StatCard';

type Window = 'lifetime' | 30 | 60 | 90;

export function Analytics() {
  const [symbol, setSymbol] = useState<TradeSymbol | 'All'>('All');
  const [windowSel, setWindowSel] = useState<Window>('lifetime');
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [rolling, setRolling] = useState<CoreStats | null>(null);
  const [insights, setInsights] = useState<AnalyticsInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getAnalyticsSummary(symbol)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    getAnalyticsInsights().then(setInsights).catch(() => {});
  }, [symbol]);

  useEffect(() => {
    if (windowSel === 'lifetime') {
      setRolling(null);
      return;
    }
    getRollingStats(windowSel, symbol).then(setRolling).catch(() => {});
  }, [windowSel, symbol]);

  // Whichever window is selected drives the top stat cards — the rest of
  // the page (equity curve, breakdowns) stays lifetime, since a 30-day
  // equity curve isn't a meaningful shape.
  const core = windowSel === 'lifetime' ? data?.core : rolling;

  const equityData = data?.equityCurve.map((p, i) => ({ label: `#${i + 1}`, balance: p.balance })) ?? [];
  const weekdayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const byWeekday = data
    ? [...data.byWeekday].sort((a, b) => weekdayOrder.indexOf(a.key) - weekdayOrder.indexOf(b.key))
    : [];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4">Analytics</Typography>
          <Typography variant="body2" color="text.secondary">
            Performance breakdown across your closed trades.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            select
            size="small"
            label="Window"
            value={windowSel}
            onChange={(e) => setWindowSel((e.target.value === 'lifetime' ? 'lifetime' : Number(e.target.value)) as Window)}
            sx={{ width: 140 }}
          >
            <MenuItem value="lifetime">Lifetime</MenuItem>
            <MenuItem value={30}>Last 30 days</MenuItem>
            <MenuItem value={60}>Last 60 days</MenuItem>
            <MenuItem value={90}>Last 90 days</MenuItem>
          </TextField>
          <TextField
            select
            size="small"
            label="Symbol"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value as TradeSymbol | 'All')}
            sx={{ width: 140 }}
          >
            <MenuItem value="All">All</MenuItem>
            <MenuItem value="GOLD">GOLD</MenuItem>
            <MenuItem value="ETHUSD">ETHUSD</MenuItem>
          </TextField>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading || !data || !core ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {windowSel !== 'lifetime' && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Showing the last {windowSel} days — equity curve and breakdowns below stay lifetime.
            </Typography>
          )}
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard
                label="Win Rate"
                value={core.winRate != null ? `${core.winRate}%` : '—'}
                sub={`${core.wins}W / ${core.losses}L / ${core.breakevens}BE`}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard
                label="Profit Factor"
                value={core.profitFactor != null ? core.profitFactor.toFixed(2) : '—'}
                sub="Gross win / gross loss"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard
                label="Avg R-Multiple"
                value={core.avgRMultiple != null ? `${core.avgRMultiple}R` : '—'}
                sub="Across trades with a Stop Loss"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard
                label="Current Streak"
                value={core.currentStreak.type ? `${core.currentStreak.count} ${core.currentStreak.type}` : '—'}
                accent={core.currentStreak.type === 'Loss' ? '#f44336' : '#4caf50'}
              />
            </Grid>
          </Grid>

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard label="Total Net P&L" value={`$${core.totalPnL.toFixed(2)}`} accent={core.totalPnL >= 0 ? '#4caf50' : '#f44336'} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard label="Avg Win" value={core.avgWin != null ? `$${core.avgWin.toFixed(2)}` : '—'} accent="#4caf50" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard label="Avg Loss" value={core.avgLoss != null ? `$${core.avgLoss.toFixed(2)}` : '—'} accent="#f44336" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard
                label="Plan Adherence"
                value={data.discipline.adherenceRate != null ? `${data.discipline.adherenceRate}%` : '—'}
                sub={`${data.discipline.trackedTrades} trades tagged`}
              />
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 7 }}>
              <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>Equity Curve</Typography>
                {equityData.length < 2 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                    Not enough closed trades yet.
                  </Typography>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={equityData}>
                      <CartesianGrid stroke="#21262D" strokeDasharray="3 3" />
                      <XAxis dataKey="label" stroke="#8B949E" fontSize={12} />
                      <YAxis stroke="#8B949E" fontSize={12} domain={['auto', 'auto']} />
                      <Tooltip
                        contentStyle={{ background: '#161B22', border: '1px solid #21262D', borderRadius: 8 }}
                        formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Balance']}
                      />
                      <Line type="monotone" dataKey="balance" stroke="#D4AF37" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </Paper>

              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>Net P&L by Day of Week</Typography>
                {byWeekday.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                    No closed trades yet.
                  </Typography>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={byWeekday}>
                      <CartesianGrid stroke="#21262D" strokeDasharray="3 3" />
                      <XAxis dataKey="key" stroke="#8B949E" fontSize={12} />
                      <YAxis stroke="#8B949E" fontSize={12} />
                      <Tooltip
                        contentStyle={{ background: '#161B22', border: '1px solid #21262D', borderRadius: 8 }}
                        formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Net P&L']}
                      />
                      <Bar dataKey="netPnL" fill="#D4AF37" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Paper>
            </Grid>

            <Grid size={{ xs: 12, md: 5 }}>
              <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>By Symbol</Typography>
                <GroupTable rows={data.bySymbol} />
              </Paper>
              <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>By Setup</Typography>
                {data.bySetup.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No trades tagged with a setup yet.</Typography>
                ) : (
                  <GroupTable rows={data.bySetup} />
                )}
              </Paper>
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>By Tag</Typography>
                {data.byTag.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No tagged trades yet.</Typography>
                ) : (
                  <GroupTable rows={data.byTag} />
                )}
              </Paper>
            </Grid>
          </Grid>

          {insights && (
            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="subtitle1" sx={{ mb: 1 }}>After a Loss vs. After a Win</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    A meaningfully lower win rate right after a loss is the classic revenge-trading signature.
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 4 }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">WIN RATE AFTER A LOSS</Typography>
                      <Typography variant="h5" color={
                        insights.behavioral.winRateAfterLoss != null && insights.behavioral.winRateAfterWin != null &&
                        insights.behavioral.winRateAfterLoss < insights.behavioral.winRateAfterWin - 10
                          ? 'error.main' : 'text.primary'
                      }>
                        {insights.behavioral.winRateAfterLoss != null ? `${insights.behavioral.winRateAfterLoss}%` : '—'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">{insights.behavioral.tradesAfterLoss} trades</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">WIN RATE AFTER A WIN</Typography>
                      <Typography variant="h5">
                        {insights.behavioral.winRateAfterWin != null ? `${insights.behavioral.winRateAfterWin}%` : '—'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">{insights.behavioral.tradesAfterWin} trades</Typography>
                    </Box>
                  </Box>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="subtitle1" sx={{ mb: 1 }}>Win Rate by Trades That Day</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Overtrading usually shows up as a falling win rate the more trades you take in a single day.
                  </Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Trade # that day</TableCell>
                        <TableCell align="right">Count</TableCell>
                        <TableCell align="right">Win Rate</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {insights.behavioral.byTradesThatDay.map((b) => (
                        <TableRow key={b.tradesSoFar}>
                          <TableCell>{b.tradesSoFar}</TableCell>
                          <TableCell align="right">{b.count}</TableCell>
                          <TableCell align="right">{b.winRate != null ? `${b.winRate}%` : '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Paper>
              </Grid>
            </Grid>
          )}
        </>
      )}
    </Box>
  );
}

function GroupTable({ rows }: { rows: AnalyticsSummary['bySymbol'] }) {
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Name</TableCell>
          <TableCell align="right">Trades</TableCell>
          <TableCell align="right">Win %</TableCell>
          <TableCell align="right">Net P&L</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {[...rows]
          .sort((a, b) => b.netPnL - a.netPnL)
          .map((r) => (
            <TableRow key={r.key}>
              <TableCell>{r.key}</TableCell>
              <TableCell align="right">{r.trades}</TableCell>
              <TableCell align="right">{r.winRate != null ? `${r.winRate}%` : '—'}</TableCell>
              <TableCell align="right" sx={{ color: r.netPnL >= 0 ? 'success.main' : 'error.main' }}>
                ${r.netPnL.toFixed(2)}
              </TableCell>
            </TableRow>
          ))}
      </TableBody>
    </Table>
  );
}
