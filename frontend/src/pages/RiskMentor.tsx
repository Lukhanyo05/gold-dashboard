import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Paper, Typography, Grid, Alert, AlertTitle, CircularProgress, Link, Chip,
  TextField, Button, Collapse, IconButton,
} from '@mui/material';
import { Settings as SettingsIcon } from '@mui/icons-material';
import type { RiskMentorReport, MentorMessage, Account } from '../api/client';
import { getRiskMentor, getAccount, updateAccount } from '../api/client';

const SEVERITY_TO_ALERT: Record<MentorMessage['severity'], 'success' | 'info' | 'warning' | 'error'> = {
  success: 'success',
  info: 'info',
  warning: 'warning',
  danger: 'error',
};

// Order flags are shown in — worst first, so the thing that most needs
// attention is always at the top regardless of the order rules fired in.
const SEVERITY_ORDER: Record<MentorMessage['severity'], number> = {
  danger: 0,
  warning: 1,
  info: 2,
  success: 3,
};

interface BookQuote {
  text: string;
  author: string;
  book: string;
}

// A short, attributed line from trading literature for each kind of mentor
// flag — not generated, just a small curated pool per message id so the
// same pattern points you toward something worth actually reading. Where
// an id has more than one candidate, the pick rotates daily (deterministic,
// not random) so it doesn't go stale if the same flag fires for a while.
const QUOTES_BY_ID: Record<string, BookQuote[]> = {
  'daily-limit-breached': [
    {
      text: 'The most important rule of trading is to play great defense, not great offense.',
      author: 'Paul Tudor Jones',
      book: 'Market Wizards',
    },
  ],
  'weekly-limit-breached': [
    {
      text: 'Rule No. 1: Never lose money. Rule No. 2: Never forget Rule No. 1.',
      author: 'Warren Buffett',
      book: 'Widely attributed',
    },
  ],
  'loss-streak': [
    {
      text: 'Amateurs think about how much money they can make. Professionals think about how much money they might lose.',
      author: 'Alexander Elder',
      book: 'Trading for a Living',
    },
    { text: 'Anything can happen.', author: 'Mark Douglas', book: 'Trading in the Zone' },
  ],
  overtrading: [
    {
      text: 'It never was my thinking that made the big money for me. It was my sitting.',
      author: 'Jesse Livermore',
      book: 'Reminiscences of a Stock Operator',
    },
  ],
  drawdown: [
    {
      text: 'The most important rule of trading is to play great defense, not great offense.',
      author: 'Paul Tudor Jones',
      book: 'Market Wizards',
    },
  ],
  'risk-per-trade-high': [
    {
      text: 'Rule No. 1: Never lose money. Rule No. 2: Never forget Rule No. 1.',
      author: 'Warren Buffett',
      book: 'Widely attributed',
    },
    {
      text: 'Amateurs think about how much money they can make. Professionals think about how much money they might lose.',
      author: 'Alexander Elder',
      book: 'Trading for a Living',
    },
  ],
  'low-adherence': [
    { text: 'Anything can happen.', author: 'Mark Douglas', book: 'Trading in the Zone' },
  ],
  'yesterday-loss': [
    { text: 'Everybody gets what they want out of the market.', author: 'Ed Seykota', book: 'Market Wizards' },
  ],
  'all-clear': [
    {
      text: 'Whatever happens in the stock market today has happened before and will happen again.',
      author: 'Jesse Livermore',
      book: 'Reminiscences of a Stock Operator',
    },
  ],
};

function quoteFor(id: string): BookQuote | null {
  const pool = QUOTES_BY_ID[id];
  if (!pool || pool.length === 0) return null;
  const startOfYear = new Date(new Date().getFullYear(), 0, 0).getTime();
  const dayOfYear = Math.floor((Date.now() - startOfYear) / 86400000);
  return pool[dayOfYear % pool.length];
}

export function RiskMentor() {
  const [report, setReport] = useState<RiskMentorReport | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [riskPctInput, setRiskPctInput] = useState(1);
  const [dailyLimitInput, setDailyLimitInput] = useState(0);
  const [weeklyLimitInput, setWeeklyLimitInput] = useState(0);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    return Promise.all([getRiskMentor(), getAccount()])
      .then(([r, a]) => {
        setReport(r);
        setAccount(a);
        setRiskPctInput(Math.round(a.riskPerTrade * 1000) / 10);
        setDailyLimitInput(a.maxDailyLossPct ? Math.round(a.maxDailyLossPct * 1000) / 10 : 0);
        setWeeklyLimitInput(a.maxWeeklyLossPct ? Math.round(a.maxWeeklyLossPct * 1000) / 10 : 0);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAccount({
        riskPerTrade: riskPctInput > 0 ? riskPctInput / 100 : 0.01,
        maxDailyLossPct: dailyLimitInput > 0 ? dailyLimitInput / 100 : null,
        maxWeeklyLossPct: weeklyLimitInput > 0 ? weeklyLimitInput / 100 : null,
      });
      await load();
      setShowEdit(false);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!report) {
    return <Alert severity="error">Couldn't load the risk mentor report.</Alert>;
  }

  const messages = [...report.messages].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );

  const streakLabel =
    report.currentStreak.type == null
      ? 'No streak'
      : `${report.currentStreak.count} ${report.currentStreak.type}${report.currentStreak.count === 1 ? '' : 's'} in a row`;

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Risk Mentor</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        A rule-based read on your risk and trading psychology right now — every message here is
        derived directly from your own trade history, not a model guessing.
      </Typography>

      {/* Risk factors — the account-level guardrails everything else here is measured against */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle2" color="text.secondary">RISK FACTORS</Typography>
          <IconButton size="small" onClick={() => setShowEdit((s) => !s)}>
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Box>
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mt: 1 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">Risk per trade</Typography>
            <Typography variant="body1">{account ? `${(account.riskPerTrade * 100).toFixed(1)}%` : '—'}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Max daily loss</Typography>
            <Typography variant="body1">
              {account?.maxDailyLossPct ? `${(account.maxDailyLossPct * 100).toFixed(1)}%` : 'Not set'}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Max weekly loss</Typography>
            <Typography variant="body1">
              {account?.maxWeeklyLossPct ? `${(account.maxWeeklyLossPct * 100).toFixed(1)}%` : 'Not set'}
            </Typography>
          </Box>
        </Box>
        <Collapse in={showEdit}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mt: 2 }}>
            <TextField
              size="small"
              type="number"
              label="Risk per Trade (%)"
              value={riskPctInput}
              onChange={(e) => setRiskPctInput(parseFloat(e.target.value) || 0)}
              sx={{ width: 180 }}
            />
            <TextField
              size="small"
              type="number"
              label="Max Daily Loss (%)"
              value={dailyLimitInput}
              onChange={(e) => setDailyLimitInput(parseFloat(e.target.value) || 0)}
              sx={{ width: 180 }}
            />
            <TextField
              size="small"
              type="number"
              label="Max Weekly Loss (%)"
              value={weeklyLimitInput}
              onChange={(e) => setWeeklyLimitInput(parseFloat(e.target.value) || 0)}
              sx={{ width: 180 }}
            />
            <Button size="small" variant="contained" onClick={handleSave} disabled={saving}>
              Save
            </Button>
            <Typography variant="caption" color="text.secondary">0 = no limit</Typography>
          </Box>
        </Collapse>
      </Paper>

      {/* Mentor messages */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
        {messages.map((m) => {
          const quote = quoteFor(m.id);
          return (
            <Alert key={m.id} severity={SEVERITY_TO_ALERT[m.severity]} variant="outlined">
              <AlertTitle>{m.title}</AlertTitle>
              {m.message}
              {quote && (
                <Box
                  sx={{
                    mt: 1.5,
                    pl: 1.5,
                    borderLeft: '3px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
                    "{quote.text}"
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    — {quote.author}, <em>{quote.book}</em>
                  </Typography>
                </Box>
              )}
            </Alert>
          );
        })}
      </Box>

      {/* Snapshot stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <Paper sx={{ p: 2.5 }}>
            <Typography variant="caption" color="text.secondary">TRADES TODAY</Typography>
            <Typography variant="h4">{report.todayTrades}</Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Paper sx={{ p: 2.5 }}>
            <Typography variant="caption" color="text.secondary">CURRENT STREAK</Typography>
            <Typography
              variant="h5"
              color={
                report.currentStreak.type === 'Loss'
                  ? 'error.main'
                  : report.currentStreak.type === 'Win'
                  ? 'success.main'
                  : 'text.primary'
              }
            >
              {streakLabel}
            </Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Paper sx={{ p: 2.5 }}>
            <Typography variant="caption" color="text.secondary">DRAWDOWN FROM PEAK</Typography>
            <Typography
              variant="h4"
              color={
                report.drawdownFromPeakPct != null && report.drawdownFromPeakPct >= 10
                  ? 'error.main'
                  : 'text.primary'
              }
            >
              {report.drawdownFromPeakPct != null ? `${report.drawdownFromPeakPct}%` : '—'}
            </Typography>
            {report.peakBalance != null && (
              <Typography variant="caption" color="text.secondary">
                Peak: ${report.peakBalance.toFixed(2)}
              </Typography>
            )}
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Paper sx={{ p: 2.5 }}>
            <Typography variant="caption" color="text.secondary">RISK / TRADE</Typography>
            <Typography variant="h4" color={report.riskPerTradePct > 2 ? 'warning.main' : 'text.primary'}>
              {report.riskPerTradePct}%
            </Typography>
            <Typography variant="caption" color="text.secondary">
              <Link component="button" onClick={() => setShowEdit(true)} sx={{ cursor: 'pointer' }}>
                Adjust above
              </Link>
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        {/* Yesterday recap */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>Yesterday</Typography>
            {report.yesterday.trades === 0 ? (
              <Typography color="text.secondary">No trades yesterday.</Typography>
            ) : (
              <Box>
                <Typography
                  variant="h4"
                  color={report.yesterday.netPnL >= 0 ? 'success.main' : 'error.main'}
                  sx={{ mb: 1 }}
                >
                  {report.yesterday.netPnL >= 0 ? '+' : ''}${report.yesterday.netPnL.toFixed(2)}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Chip size="small" label={`${report.yesterday.trades} trades`} />
                  {report.yesterday.winRate != null && (
                    <Chip size="small" label={`${report.yesterday.winRate}% win rate`} variant="outlined" />
                  )}
                  {report.yesterday.adherenceRate != null && (
                    <Chip
                      size="small"
                      label={`${report.yesterday.adherenceRate}% plan adherence`}
                      color="info"
                      variant="outlined"
                    />
                  )}
                </Box>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Behavior / psychology */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" sx={{ mb: 1.5 }}>Behavior (last 30 days)</Typography>
            <Typography variant="caption" color="text.secondary">PLAN ADHERENCE</Typography>
            <Typography
              variant="h4"
              color={
                report.recentAdherenceRate == null
                  ? 'text.primary'
                  : report.recentAdherenceRate < 70
                  ? 'warning.main'
                  : 'success.main'
              }
              sx={{ mb: 1 }}
            >
              {report.recentAdherenceRate != null ? `${report.recentAdherenceRate}%` : 'Not tracked yet'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Full behavioral breakdown (win rate after a loss vs. after a win, win rate by trades-that-day)
              lives on <Link component={RouterLink} to="/analytics">Analytics</Link>.
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
