import { useEffect, useState } from 'react';
import {
  Box, Paper, Typography, Grid, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, LinearProgress, IconButton, Chip,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, CheckCircle as CheckIcon } from '@mui/icons-material';
import type { Goal, GoalType } from '../api/client';
import { getGoals, createGoal, updateGoal, deleteGoal } from '../api/client';

const TYPE_LABELS: Record<GoalType, string> = {
  Balance: 'Account Balance ($)',
  WinRate: 'Win Rate (%)',
  ProfitFactor: 'Profit Factor',
  Custom: 'Custom (manual)',
};

export function Goals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [type, setType] = useState<GoalType>('Balance');
  const [targetValue, setTargetValue] = useState(1000);
  const [targetDate, setTargetDate] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => getGoals().then(setGoals).catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!label.trim() || targetValue <= 0) return;
    setSaving(true);
    try {
      await createGoal({
        label: label.trim(),
        type,
        targetValue,
        targetDate: targetDate || null,
      });
      setOpen(false);
      setLabel('');
      setTargetValue(1000);
      setTargetDate('');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteGoal(id);
    await load();
  };

  const handleMarkAchieved = async (id: string, achieved: boolean) => {
    await updateGoal(id, { achieved });
    await load();
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>Goals</Typography>
          <Typography variant="body2" color="text.secondary">
            Concrete targets, tracked against your actual trading data — not just the compounding math.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
          New Goal
        </Button>
      </Box>

      <Grid container spacing={2}>
        {goals.length === 0 && (
          <Grid size={{ xs: 12 }}>
            <Paper sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">
                No goals yet. Set one — e.g. "Grow to $1,000 balance" or "Hit 55% win rate this month".
              </Typography>
            </Paper>
          </Grid>
        )}
        {goals.map((g) => {
          const pct = g.progressPct ?? 0;
          const isDone = g.achieved || g.reachedNow;
          return (
            <Grid size={{ xs: 12, md: 6 }} key={g._id}>
              <Paper sx={{ p: 3, opacity: g.achieved ? 0.75 : 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box>
                    <Typography variant="h6">{g.label}</Typography>
                    <Chip size="small" label={TYPE_LABELS[g.type]} sx={{ mt: 0.5, mb: 1 }} />
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {!g.achieved && (
                      <IconButton
                        size="small"
                        color={isDone ? 'success' : 'default'}
                        onClick={() => handleMarkAchieved(g._id, true)}
                        title="Mark as achieved"
                      >
                        <CheckIcon fontSize="small" />
                      </IconButton>
                    )}
                    <IconButton size="small" onClick={() => handleDelete(g._id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>

                <Box sx={{ mt: 1, mb: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      {g.currentValue != null ? g.currentValue.toLocaleString() : '—'} / {g.targetValue.toLocaleString()}
                    </Typography>
                    <Typography variant="caption" color={isDone ? 'success.main' : 'text.secondary'}>
                      {g.progressPct != null ? `${g.progressPct}%` : 'manual'}
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={Math.max(0, Math.min(100, pct))}
                    color={isDone ? 'success' : 'primary'}
                    sx={{ height: 8, borderRadius: 4 }}
                  />
                </Box>

                {g.targetDate && (
                  <Typography variant="caption" color="text.secondary">
                    Target date: {new Date(g.targetDate).toLocaleDateString()}
                  </Typography>
                )}
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>New Goal</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Goal"
            placeholder="e.g. Grow account to $1,000"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            fullWidth
            select
            label="Tracks"
            value={type}
            onChange={(e) => setType(e.target.value as GoalType)}
            sx={{ mb: 2 }}
          >
            {(Object.keys(TYPE_LABELS) as GoalType[]).map((t) => (
              <MenuItem key={t} value={t}>{TYPE_LABELS[t]}</MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth
            type="number"
            label="Target Value"
            value={targetValue}
            onChange={(e) => setTargetValue(parseFloat(e.target.value) || 0)}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            type="date"
            label="Target Date (optional)"
            slotProps={{ inputLabel: { shrink: true } }}
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving}>
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
