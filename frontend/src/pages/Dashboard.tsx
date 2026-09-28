import { useEffect, useState } from 'react';
import {
  Box, Grid, Paper, Typography, CircularProgress, Alert, LinearProgress, Chip, Button,
  TextField, IconButton, Collapse,
} from '@mui/material';
import { Settings as SettingsIcon } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { StatCard } from '../components/StatCard';
import { EquityChart } from '../components/EquityChart';
import type { Account, Trade, TradeSymbol, DayPnL, RiskStatus, WeeklyRecap } from '../api/client';
import {
  getAccount, getTrades, getProjection, getCalendarPnL,
  getRiskStatus, getAnalyticsInsights, updateAccount,
} from '../api/client';
import { GoldPriceTile } from '../components/GoldPriceTile';
import { EthPriceTile } from '../components/EthPriceTile';

interface SymbolStats {
  count: number;
  winRate: number;
  netPnl: number;
}

function statsForSymbol(trades: Trade[], symbol: TradeSymbol): SymbolStats {
  const symTrades = trades.filter((t) => (t.symbol ?? 'GOLD') === symbol);
  const symClosed = symTrades.filter((t) => t.result !== 'Open' && t.balanceAfter != null);
  const symWins = symClosed.filter((t) => t.result === 'Win').length;
  const netPnl = symClosed.reduce(
    (sum, t) => sum + ((t.balanceAfter as number) - t.balanceBefore),
    0
  );
  return {
    count: symTrades.length,
    winRate: symClosed.length ? (symWins / symClosed.length) * 100 : 0,
    netPnl,
  };
}

export function Dashboard() {
  const [account, setAccount] = useState<Account | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [months, setMonths] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentDays, setRecentDays] = useState<DayPnL[]>([]);
  const [riskStatus, setRiskStatus] = useState<RiskStatus | null>(null);
  const [lastWeek, setLastWeek] = useState<WeeklyRecap | null>(null);
  const [showRiskSettings, setShowRiskSettings] = useState(false);
  const [dailyLimitInput, setDailyLimitInput] = useState(0);
  const [weeklyLimitInput, setWeeklyLimitInput] = useState(0);
  const [savingLimits, setSavingLimits] = useState(false);

  const refreshRiskStatus = () => getRiskStatus().then(setRiskStatus).catch(() => {});

  useEffect(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    getCalendarPnL(thisMonth).then(setRecentDays).catch(() => {});
    refreshRiskStatus();
    getAnalyticsInsights().then((i) => setLastWeek(i.lastWeek)).catch(() => {});

    Promise.all([getAccount(), getTrades()])
      .then(([a, t]) => {
        setAccount(a);
        setTrades(t);
        setDailyLimitInput(a.maxDailyLossPct ? a.maxDailyLossPct * 100 : 0);
        setWeeklyLimitInput(a.maxWeeklyLossPct ? a.maxWeeklyLossPct * 100 : 0);

        // Real trailing average monthly P/L, not a guess: total realized
        // profit across all closed trades divided by the number of
        // calendar months it was earned over. Feeds the "months to
        // target" projection with an actual performance figure instead
        // of a fixed placeholder.
        const closedWithPnl = t.filter(
          (tr) => tr.balanceAfter != null && tr.result !== 'Open'
        );
        let avgPL = 0;
        if (closedWithPnl.length > 0) {
          const totalPnl = closedWithPnl.reduce(
            (sum, tr) => sum + ((tr.balanceAfter as number) - tr.balanceBefore),
            0
          );
          const dates = closedWithPnl.map((tr) => new Date(tr.date).getTime());
          const min = new Date(Math.min(...dates));
          const max = new Date(Math.max(...dates));
          const monthsSpan = Math.max(
            1,
            (max.getFullYear() - min.getFullYear()) * 12 +
              (max.getMonth() - min.getMonth()) +
              1
          );
          avgPL = totalPnl / monthsSpan;
        }
        return avgPL > 0 ? getProjection(avgPL) : Promise.resolve(null);
      })
      .then((p) => setMonths(p ? p.monthsToTarget : null))
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

  const goldStats = statsForSymbol(trades, 'GOLD');
  const ethStats = statsForSymbol(trades, 'ETHUSD');

  // Discipline tracking: current win/loss streak, from the most recent
  // closed trade backwards (Breakeven/Manual results break the streak).
  const closedChrono = [...closed].sort(
    (a, b) => +new Date(a.date) - +new Date(b.date)
  );
  let currentStreak = 0;
  let streakType: 'Win' | 'Loss' | null = null;
  for (let i = closedChrono.length - 1; i >= 0; i--) {
    const r = closedChrono[i].result;
    if (streakType === null) {
      if (r === 'Win' || r === 'Loss') {
        streakType = r;
        currentStreak = 1;
      } else {
        break;
      }
    } else if (r === streakType) {
      currentStreak++;
    } else {
      break;
    }
  }

  // Simple, honest revenge-trading check: did the most recent trade (open
  // or closed) use a lot size well above your average, right after a loss?
  // This is a pattern flag, not a verdict — worth a look, not an alarm.
  let revengeWarning: string | null = null;
  const chronoAll = [...trades].sort((a, b) => +new Date(a.date) - +new Date(b.date));
  if (chronoAll.length >= 2) {
    const latest = chronoAll[chronoAll.length - 1];
    const prev = chronoAll[chronoAll.length - 2];
    const priorTrades = chronoAll.slice(0, -1);
    const avgLot = priorTrades.reduce((s, t) => s + t.lotSize, 0) / priorTrades.length;
    if (prev.result === 'Loss' && avgLot > 0 && latest.lotSize > avgLot * 1.5) {
      revengeWarning = `Trade #${latest.tradeNumber} used ${latest.lotSize} lots — over 1.5x your average (${avgLot.toFixed(2)}) — right after a loss on #${prev.tradeNumber}. Worth a gut-check that this wasn't a revenge trade.`;
    }
  }

  const trackedDiscipline = closed.filter((t) => t.followedPlan != null);
  const followedCount = trackedDiscipline.filter((t) => t.followedPlan === true).length;
  const adherenceRate =
    trackedDiscipline.length > 0 ? (followedCount / trackedDiscipline.length) * 100 : null;

  const last14 = recentDays.slice(-14);

  const handleSaveLimits = async () => {
    setSavingLimits(true);
    try {
      const updated = await updateAccount({
        maxDailyLossPct: dailyLimitInput > 0 ? dailyLimitInput / 100 : null,
        maxWeeklyLossPct: weeklyLimitInput > 0 ? weeklyLimitInput / 100 : null,
      });
      setAccount(updated);
      await refreshRiskStatus();
      setShowRiskSettings(false);
    } finally {
      setSavingLimits(false);
    }
  };

  const hasAnyLimit = !!(riskStatus?.dailyLimitUSD || riskStatus?.weeklyLimitUSD);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>Dashboard</Typography>
          <Typography variant="body2" color="text.secondary">
            Live snapshot of your trading company capital.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button component={RouterLink} to="/calendar" size="small" variant="outlined">
            Calendar
          </Button>
          <Button component={RouterLink} to="/analytics" size="small" variant="outlined">
            Analytics
          </Button>
          <Button component={RouterLink} to="/playbooks" size="small" variant="outlined">
            Playbooks
          </Button>
          <Button component={RouterLink} to="/goals" size="small" variant="outlined">
            Goals
          </Button>
          <Button component={RouterLink} to="/market" size="small" variant="outlined">
            Market
          </Button>
        </Box>
      </Box>

      {revengeWarning && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {revengeWarning}
        </Alert>
      )}

      {riskStatus?.dailyBreached && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Today's loss (${Math.abs(riskStatus.todayPnL).toFixed(2)}) has hit your daily limit of $
          {riskStatus.dailyLimitUSD?.toFixed(2)} ({(riskStatus.dailyLimitPct! * 100).toFixed(0)}% of balance).
          Consider stepping away for the day.
        </Alert>
      )}
      {!riskStatus?.dailyBreached && riskStatus?.weeklyBreached && (
        <Alert severity="error" sx={{ mb: 2 }}>
          This week's loss (${Math.abs(riskStatus.weekPnL).toFixed(2)}) has hit your weekly limit of $
          {riskStatus.weeklyLimitUSD?.toFixed(2)} ({(riskStatus.weeklyLimitPct! * 100).toFixed(0)}% of balance).
          Consider stepping back until next week.
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="caption" color="text.secondary">TODAY'S P/L</Typography>
              <Typography variant="h6" color={(riskStatus?.todayPnL ?? 0) >= 0 ? 'success.main' : 'error.main'}>
                {riskStatus ? `${riskStatus.todayPnL >= 0 ? '+' : ''}$${riskStatus.todayPnL.toFixed(2)}` : '—'}
                {riskStatus?.dailyLimitUSD ? (
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    / -${riskStatus.dailyLimitUSD.toFixed(2)} limit
                  </Typography>
                ) : null}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">THIS WEEK'S P/L</Typography>
              <Typography variant="h6" color={(riskStatus?.weekPnL ?? 0) >= 0 ? 'success.main' : 'error.main'}>
                {riskStatus ? `${riskStatus.weekPnL >= 0 ? '+' : ''}$${riskStatus.weekPnL.toFixed(2)}` : '—'}
                {riskStatus?.weeklyLimitUSD ? (
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    / -${riskStatus.weeklyLimitUSD.toFixed(2)} limit
                  </Typography>
                ) : null}
              </Typography>
            </Box>
            {!hasAnyLimit && (
              <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                No loss guardrails set
              </Typography>
            )}
          </Box>
          <IconButton size="small" onClick={() => setShowRiskSettings((s) => !s)}>
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Box>
        <Collapse in={showRiskSettings}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 2, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              type="number"
              label="Max Daily Loss (% of balance)"
              value={dailyLimitInput}
              onChange={(e) => setDailyLimitInput(parseFloat(e.target.value) || 0)}
              sx={{ width: 220 }}
            />
            <TextField
              size="small"
              type="number"
              label="Max Weekly Loss (% of balance)"
              value={weeklyLimitInput}
              onChange={(e) => setWeeklyLimitInput(parseFloat(e.target.value) || 0)}
              sx={{ width: 220 }}
            />
            <Button size="small" variant="contained" onClick={handleSaveLimits} disabled={savingLimits}>
              Save
            </Button>
            <Typography variant="caption" color="text.secondary">
              0 = no limit
            </Typography>
          </Box>
        </Collapse>
      </Paper>

      {lastWeek && lastWeek.trades > 0 && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Last Week Recap ({lastWeek.weekStart} – {lastWeek.weekEnd})
          </Typography>
          <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="caption" color="text.secondary">NET P/L</Typography>
              <Typography variant="h6" color={lastWeek.netPnL >= 0 ? 'success.main' : 'error.main'}>
                {lastWeek.netPnL >= 0 ? '+' : ''}${lastWeek.netPnL.toFixed(2)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">TRADES</Typography>
              <Typography variant="h6">{lastWeek.trades}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">WIN RATE</Typography>
              <Typography variant="h6">{lastWeek.winRate != null ? `${lastWeek.winRate}%` : '—'}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">BEST DAY</Typography>
              <Typography variant="h6" color="success.main">
                {lastWeek.bestDay ? `+$${lastWeek.bestDay.netPnL.toFixed(2)}` : '—'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">WORST DAY</Typography>
              <Typography variant="h6" color="error.main">
                {lastWeek.worstDay ? `$${lastWeek.worstDay.netPnL.toFixed(2)}` : '—'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">PLAN ADHERENCE</Typography>
              <Typography variant="h6">{lastWeek.adherenceRate != null ? `${lastWeek.adherenceRate}%` : '—'}</Typography>
            </Box>
          </Box>
        </Paper>
      )}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <GoldPriceTile />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <EthPriceTile />
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
            label={`Months to $${account.targetBalance.toLocaleString()}`}
            value={months != null ? months : 'N/A'}
            sub={
              months != null
                ? `~${(months / 12).toFixed(1)} years, at your trailing average P/L`
                : 'Need closed trades to project'
            }
            accent="#D4AF37"
          />
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            label="GOLD — Net P/L"
            value={`$${goldStats.netPnl.toFixed(2)}`}
            sub={`${goldStats.count} trade(s) · ${goldStats.winRate.toFixed(0)}% win rate`}
            accent={goldStats.netPnl >= 0 ? '#4CAF50' : '#E53935'}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            label="ETHUSD — Net P/L"
            value={`$${ethStats.netPnl.toFixed(2)}`}
            sub={`${ethStats.count} trade(s) · ${ethStats.winRate.toFixed(0)}% win rate`}
            accent={ethStats.netPnl >= 0 ? '#4CAF50' : '#E53935'}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            label="Current Streak"
            value={
              streakType
                ? `${currentStreak} ${streakType === 'Win' ? 'Win' : 'Loss'}${currentStreak > 1 ? 's' : ''}`
                : '—'
            }
            sub={
              streakType === 'Loss' && currentStreak >= 3
                ? 'Consider stepping back'
                : 'Discipline tracking'
            }
            accent={streakType === 'Loss' ? '#E53935' : '#4CAF50'}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            label="Overall Win Rate"
            value={`${winRate.toFixed(1)}%`}
            sub={`${totalTrades} trade(s) logged`}
            accent="#4A90E2"
          />
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            label="Plan Adherence"
            value={adherenceRate != null ? `${adherenceRate.toFixed(0)}%` : '—'}
            sub={
              trackedDiscipline.length > 0
                ? `${followedCount}/${trackedDiscipline.length} trades followed the plan`
                : 'Tag trades with "Followed plan" to track this'
            }
            accent={adherenceRate == null || adherenceRate >= 70 ? '#4CAF50' : '#E53935'}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 9 }}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              Last {last14.length || 0} trading day{last14.length === 1 ? '' : 's'} this month
            </Typography>
            {last14.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No closed trades yet this month.
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', gap: 0.75 }}>
                {last14.map((d) => (
                  <Box
                    key={d.date}
                    title={`${d.date}: $${d.netPnL.toFixed(2)} (${d.trades} trade${d.trades === 1 ? '' : 's'})`}
                    sx={{
                      flex: 1,
                      height: 36,
                      borderRadius: 1,
                      bgcolor: d.netPnL > 0 ? 'rgba(76,175,80,0.25)' : d.netPnL < 0 ? 'rgba(244,67,54,0.25)' : 'rgba(255,255,255,0.05)',
                      border: '1px solid',
                      borderColor: d.netPnL > 0 ? 'success.main' : d.netPnL < 0 ? 'error.main' : 'divider',
                    }}
                  />
                ))}
              </Box>
            )}
          </Paper>
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
            <Typography variant="h6" sx={{ mb: 2 }}>
              Progress to ${account.targetBalance.toLocaleString()}
            </Typography>
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

              <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2 }}>By Symbol</Typography>
              <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                <Chip size="small" label={`GOLD: ${goldStats.count}`} variant="outlined" />
                <Chip size="small" label={`ETHUSD: ${ethStats.count}`} variant="outlined" />
              </Box>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
