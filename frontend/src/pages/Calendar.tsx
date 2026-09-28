import { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, IconButton, Paper, Grid, Dialog, DialogTitle,
  DialogContent, DialogActions, Button, List, ListItem, ListItemText, Chip,
  CircularProgress, TextField, ToggleButton, ToggleButtonGroup, Table, TableBody,
  TableCell, TableHead, TableRow,
} from '@mui/material';
import { ChevronLeft, ChevronRight } from '@mui/icons-material';
import type { DayPnL, Trade, DailyJournalEntry, MoodPnLBucket } from '../api/client';
import {
  getCalendarPnL, getTrades, getDailyJournalMonth, getDailyJournalEntry,
  saveDailyJournalEntry, getMoodCorrelation,
} from '../api/client';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// 1 = worst day, 5 = best day — kept as a plain 1-5 scale (matches the
// backend) with emoji purely for display.
const MOOD_EMOJI: Record<number, string> = { 1: '😞', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' };
const MOOD_LABELS: Record<number, string> = {
  1: 'Terrible', 2: 'Rough', 3: 'Neutral', 4: 'Good', 5: 'Great',
};

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function CalendarPage() {
  const [cursor, setCursor] = useState(() => new Date());
  const [days, setDays] = useState<DayPnL[]>([]);
  const [loading, setLoading] = useState(true);
  const [allTrades, setAllTrades] = useState<Trade[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [journalEntries, setJournalEntries] = useState<DailyJournalEntry[]>([]);
  const [entryMood, setEntryMood] = useState<number | null>(null);
  const [entryNote, setEntryNote] = useState('');
  const [entryLoading, setEntryLoading] = useState(false);
  const [entrySaving, setEntrySaving] = useState(false);
  const [moodCorrelation, setMoodCorrelation] = useState<MoodPnLBucket[]>([]);

  const loadMonth = () => {
    setLoading(true);
    const month = monthKey(cursor);
    return Promise.all([getCalendarPnL(month), getDailyJournalMonth(month)])
      .then(([d, entries]) => {
        setDays(d);
        setJournalEntries(entries);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  useEffect(() => {
    getTrades('All').then(setAllTrades).catch(() => {});
    getMoodCorrelation().then(setMoodCorrelation).catch(() => {});
  }, []);

  const byDate = useMemo(() => {
    const map = new Map<string, DayPnL>();
    days.forEach((d) => map.set(d.date, d));
    return map;
  }, [days]);

  const moodByDate = useMemo(() => {
    const map = new Map<string, number>();
    journalEntries.forEach((e) => {
      if (e.mood != null) map.set(e.date, e.mood);
    });
    return map;
  }, [journalEntries]);

  const openDay = (date: string) => {
    setSelectedDay(date);
    setEntryLoading(true);
    getDailyJournalEntry(date)
      .then((e) => {
        setEntryMood(e.mood);
        setEntryNote(e.note);
      })
      .finally(() => setEntryLoading(false));
  };

  const saveEntry = async () => {
    if (!selectedDay) return;
    setEntrySaving(true);
    try {
      await saveDailyJournalEntry(selectedDay, { mood: entryMood, note: entryNote });
      await loadMonth();
      getMoodCorrelation().then(setMoodCorrelation).catch(() => {});
    } finally {
      setEntrySaving(false);
    }
  };

  const monthDays = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: { date: string | null; label: number | null }[] = [];
    for (let i = 0; i < startOffset; i++) cells.push({ date: null, label: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ date: dateStr, label: d });
    }
    return cells;
  }, [cursor]);

  const monthTotal = days.reduce((sum, d) => sum + d.netPnL, 0);
  const tradingDays = days.length;
  const greenDays = days.filter((d) => d.netPnL > 0).length;

  const dayTrades = selectedDay
    ? allTrades.filter((t) => new Date(t.date).toISOString().slice(0, 10) === selectedDay)
    : [];

  const cellColor = (pnl: number) => {
    if (pnl > 0) return 'rgba(76, 175, 80, 0.18)';
    if (pnl < 0) return 'rgba(244, 67, 54, 0.18)';
    return 'rgba(255,255,255,0.03)';
  };
  const cellBorder = (pnl: number) => {
    if (pnl > 0) return 'rgba(76, 175, 80, 0.6)';
    if (pnl < 0) return 'rgba(244, 67, 54, 0.6)';
    return 'rgba(255,255,255,0.08)';
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4">Calendar</Typography>
          <Typography variant="body2" color="text.secondary">
            Daily net P&L — {tradingDays} trading day{tradingDays === 1 ? '' : 's'}, {greenDays} green ·{' '}
            <Box component="span" sx={{ color: monthTotal >= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}>
              ${monthTotal.toFixed(2)}
            </Box>{' '}
            this month
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            <ChevronLeft />
          </IconButton>
          <Typography variant="h6" sx={{ minWidth: 160, textAlign: 'center' }}>
            {cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </Typography>
          <IconButton onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            <ChevronRight />
          </IconButton>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Paper sx={{ p: 2 }}>
          <Grid container spacing={1} sx={{ mb: 1 }}>
            {WEEKDAY_LABELS.map((w) => (
              <Grid size={{ xs: 12 / 7 }} key={w}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center' }}>
                  {w}
                </Typography>
              </Grid>
            ))}
          </Grid>
          <Grid container spacing={1}>
            {monthDays.map((cell, i) => {
              const day = cell.date ? byDate.get(cell.date) : undefined;
              const mood = cell.date ? moodByDate.get(cell.date) : undefined;
              return (
                <Grid size={{ xs: 12 / 7 }} key={i}>
                  {cell.date ? (
                    <Box
                      onClick={() => openDay(cell.date as string)}
                      sx={{
                        height: 76,
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: day ? cellBorder(day.netPnL) : 'rgba(255,255,255,0.08)',
                        bgcolor: day ? cellColor(day.netPnL) : 'transparent',
                        p: 0.75,
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        position: 'relative',
                        '&:hover': { borderColor: 'primary.main' },
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Typography variant="caption" color="text.secondary">
                          {cell.label}
                        </Typography>
                        {mood != null && (
                          <Typography variant="caption" title={MOOD_LABELS[mood]}>
                            {MOOD_EMOJI[mood]}
                          </Typography>
                        )}
                      </Box>
                      {day && (
                        <Box>
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 700, color: day.netPnL >= 0 ? 'success.main' : 'error.main' }}
                          >
                            {day.netPnL >= 0 ? '+' : ''}
                            {day.netPnL.toFixed(0)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {day.trades} trade{day.trades === 1 ? '' : 's'}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  ) : (
                    <Box sx={{ height: 76 }} />
                  )}
                </Grid>
              );
            })}
          </Grid>
        </Paper>
      )}

      <Dialog open={!!selectedDay} onClose={() => setSelectedDay(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{selectedDay}</DialogTitle>
        <DialogContent>
          <List>
            {dayTrades.map((t) => (
              <ListItem key={t._id} divider>
                <ListItemText
                  primary={`${t.symbol} ${t.direction} · ${t.lotSize} lot`}
                  secondary={`Entry ${t.entry}${t.closePrice != null ? ` → Close ${t.closePrice}` : ' (open)'}`}
                />
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                  <Chip
                    size="small"
                    label={t.result}
                    color={t.result === 'Win' ? 'success' : t.result === 'Loss' ? 'error' : 'default'}
                  />
                  {t.balanceAfter != null && (
                    <Typography variant="caption" color="text.secondary">
                      {(t.balanceAfter - t.balanceBefore >= 0 ? '+' : '')}
                      {(t.balanceAfter - t.balanceBefore).toFixed(2)}
                    </Typography>
                  )}
                </Box>
              </ListItem>
            ))}
            {dayTrades.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                No trades found for this day.
              </Typography>
            )}
          </List>

          <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2, mb: 1 }}>
            DAILY JOURNAL
          </Typography>
          {entryLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={20} />
            </Box>
          ) : (
            <>
              <Typography variant="caption" color="text.secondary">Mood</Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={entryMood}
                onChange={(_e, val) => setEntryMood(val)}
                sx={{ display: 'flex', mb: 2, mt: 0.5 }}
              >
                {[1, 2, 3, 4, 5].map((m) => (
                  <ToggleButton key={m} value={m} sx={{ flex: 1 }} title={MOOD_LABELS[m]}>
                    {MOOD_EMOJI[m]}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Notes — how did today go, what were you feeling?"
                value={entryNote}
                onChange={(e) => setEntryNote(e.target.value)}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedDay(null)}>Close</Button>
          <Button variant="contained" onClick={saveEntry} disabled={entrySaving || entryLoading}>
            Save Journal Entry
          </Button>
        </DialogActions>
      </Dialog>

      {moodCorrelation.some((b) => b.days > 0) && (
        <Paper sx={{ p: 2, mt: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            MOOD vs. P&amp;L (all-time)
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Mood</TableCell>
                <TableCell align="right">Days</TableCell>
                <TableCell align="right">Avg Net P&amp;L</TableCell>
                <TableCell align="right">% Positive Days</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {moodCorrelation.map((b) => (
                <TableRow key={b.mood}>
                  <TableCell>{MOOD_EMOJI[b.mood]} {MOOD_LABELS[b.mood]}</TableCell>
                  <TableCell align="right">{b.days}</TableCell>
                  <TableCell
                    align="right"
                    sx={{ color: b.days === 0 ? 'text.secondary' : b.avgNetPnL >= 0 ? 'success.main' : 'error.main' }}
                  >
                    {b.days === 0 ? '—' : `${b.avgNetPnL >= 0 ? '+' : ''}$${b.avgNetPnL.toFixed(2)}`}
                  </TableCell>
                  <TableCell align="right">{b.positiveDayRate != null ? `${b.positiveDayRate}%` : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Box>
  );
}
