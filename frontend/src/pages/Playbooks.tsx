import { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Card, CardContent, CardActions, Grid, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, IconButton, Chip,
  CircularProgress, Alert, List, ListItem, ListItemText, Divider,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, Edit as EditIcon } from '@mui/icons-material';
import type { Playbook, PlaybookAdherence } from '../api/client';
import {
  getPlaybooks, createPlaybook, updatePlaybook, deletePlaybook, getPlaybookAdherence,
} from '../api/client';

const emptyForm = { name: '', description: '', rules: [] as string[], ruleInput: '', color: '#d4af37' };

export function Playbooks() {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Playbook | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [adherence, setAdherence] = useState<Record<string, PlaybookAdherence>>({});

  const load = () => {
    setLoading(true);
    getPlaybooks()
      .then((data) => {
        setPlaybooks(data);
        data.forEach((p) => {
          getPlaybookAdherence(p._id)
            .then((a) => setAdherence((prev) => ({ ...prev, [p._id]: a })))
            .catch(() => {});
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (p: Playbook) => {
    setEditing(p);
    setForm({ name: p.name, description: p.description ?? '', rules: p.rules, ruleInput: '', color: p.color ?? '#d4af37' });
    setOpen(true);
  };

  const addRule = () => {
    if (!form.ruleInput.trim()) return;
    setForm({ ...form, rules: [...form.rules, form.ruleInput.trim()], ruleInput: '' });
  };

  const removeRule = (idx: number) => {
    setForm({ ...form, rules: form.rules.filter((_, i) => i !== idx) });
  };

  const submit = async () => {
    try {
      setError(null);
      const payload = { name: form.name, description: form.description, rules: form.rules, color: form.color };
      if (editing) {
        await updatePlaybook(editing._id, payload);
      } else {
        await createPlaybook(payload);
      }
      setOpen(false);
      load();
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err?.response?.data?.error ?? err?.message ?? 'Save failed');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this playbook? Trades tagged with it keep their setup name.')) return;
    await deletePlaybook(id);
    load();
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4">Playbooks</Typography>
          <Typography variant="body2" color="text.secondary">
            Define your setups and rules, then tag trades with them in the Journal to track adherence.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openNew}>
          New Playbook
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : playbooks.length === 0 ? (
        <Alert severity="info">
          No playbooks yet. Add one for each setup you trade (e.g. "London Breakout", "Trend Pullback") with its
          entry rules, then tag your trades with it in the Journal.
        </Alert>
      ) : (
        <Grid container spacing={2}>
          {playbooks.map((p) => {
            const a = adherence[p._id];
            return (
              <Grid size={{ xs: 12, md: 6, lg: 4 }} key={p._id}>
                <Card sx={{ borderTop: `3px solid ${p.color ?? '#d4af37'}` }}>
                  <CardContent>
                    <Typography variant="h6">{p.name}</Typography>
                    {p.description && (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        {p.description}
                      </Typography>
                    )}
                    <List dense disablePadding>
                      {p.rules.map((r, i) => (
                        <ListItem key={i} disableGutters>
                          <ListItemText primary={`• ${r}`} />
                        </ListItem>
                      ))}
                    </List>
                    {a && a.trades > 0 && (
                      <>
                        <Divider sx={{ my: 1.5 }} />
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                          <Chip size="small" label={`${a.trades} trades`} />
                          {a.winRate != null && (
                            <Chip size="small" label={`${a.winRate}% win rate`} color="primary" variant="outlined" />
                          )}
                          <Chip
                            size="small"
                            label={`Net $${a.netPnL.toFixed(2)}`}
                            color={a.netPnL >= 0 ? 'success' : 'error'}
                            variant="outlined"
                          />
                          {a.adherenceRate != null && (
                            <Chip size="small" label={`${a.adherenceRate}% plan adherence`} color="info" variant="outlined" />
                          )}
                        </Box>
                      </>
                    )}
                  </CardContent>
                  <CardActions>
                    <IconButton size="small" onClick={() => openEdit(p)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => remove(p._id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </CardActions>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Playbook' : 'New Playbook'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              fullWidth
              label="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
            <TextField
              fullWidth
              multiline
              rows={2}
              label="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <TextField
              fullWidth
              label="Color"
              type="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              sx={{ width: 120 }}
            />
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Rules / checklist
              </Typography>
              {form.rules.map((r, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="body2" sx={{ flexGrow: 1 }}>
                    • {r}
                  </Typography>
                  <IconButton size="small" onClick={() => removeRule(i)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Add a rule and press Enter"
                  value={form.ruleInput}
                  onChange={(e) => setForm({ ...form, ruleInput: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addRule();
                    }
                  }}
                />
                <Button onClick={addRule}>Add</Button>
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={submit} disabled={!form.name.trim()}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
