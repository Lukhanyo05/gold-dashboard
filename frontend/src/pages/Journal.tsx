import { useEffect, useRef, useState } from 'react';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell,
  TableHead, TableRow, Chip, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, Grid, Alert,
  CircularProgress, Snackbar,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
} from '@mui/icons-material';
import type { Trade } from '../api/client';
import {
  getTrades, createTrade, deleteTrade, updateTrade,
  downloadTradesCSV, importTradesFile,
} from '../api/client';

const emptyForm = {
  direction: 'Buy' as 'Buy' | 'Sell',
  entry: '',
  stopLoss: '',
  takeProfit: '',
  lotSize: '',
  swapFee: '0',
  closePrice: '',
  notes: '',
};

type ChipColor = 'success' | 'error' | 'default' | 'info' | 'warning';

export function Journal() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [editClosePrice, setEditClosePrice] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [importing, setImporting] = useState(false);
  const [snack, setSnack] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () =>
    getTrades()
      .then(setTrades)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    try {
      setError(null);
      await createTrade({
        direction: form.direction,
        entry: parseFloat(form.entry),
        stopLoss: form.stopLoss ? parseFloat(form.stopLoss) : null,
        takeProfit: form.takeProfit ? parseFloat(form.takeProfit) : null,
        lotSize: form.lotSize ? parseFloat(form.lotSize) : undefined,
        swapFee: parseFloat(form.swapFee || '0'),
        closePrice: form.closePrice ? parseFloat(form.closePrice) : null,
        notes: form.notes,
      } as Partial<Trade>);
      setOpen(false);
      setForm(emptyForm);
      load();
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } }; message?: string };
      setError(err?.response?.data?.error ?? err?.message ?? 'Unknown error');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this trade?')) return;
    await deleteTrade(id);
    load();
  };

  const openEdit = (t: Trade) => {
    setEditingTrade(t);
    setEditClosePrice(t.closePrice != null ? String(t.closePrice) : '');
    setEditNotes(t.notes ?? '');
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editingTrade) return;
    try {
      setError(null);
      await updateTrade(editingTrade._id, {
        closePrice: editClosePrice ? parseFloat(editClosePrice) : null,
        notes: editNotes,
      } as Partial<Trade>);
      setEditOpen(false);
      setEditingTrade(null);
      load();
    } catch (e) {
      const err = e as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      setError(err?.response?.data?.error ?? err?.message ?? 'Update failed');
    }
  };

  const handleExport = async () => {
    try {
      await downloadTradesCSV();
      setSnack('Trades exported successfully');
    } catch (e) {
      const err = e as { message?: string };
      setError(err?.message ?? 'Export failed');
    }
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImporting(true);
    setError(null);
    try {
      const result = await importTradesFile(file);
      load();
      setSnack(
        `Imported ${result.inserted} trade(s).` +
          (result.skipped > 0 ? ` ${result.skipped} skipped.` : '') +
          ` New balance: $${result.newBalance.toFixed(2)}`
      );
    } catch (err) {
      const e2 = err as {
        response?: { data?: { error?: string; parseErrors?: string[] } };
        message?: string;
      };
      const parseErrors = e2?.response?.data?.parseErrors;
      const msg = e2?.response?.data?.error ?? e2?.message ?? 'Import failed';
      setError(
        parseErrors?.length ? `${msg}\n${parseErrors.slice(0, 5).join('\n')}` : msg
      );
    } finally {
      setImporting(false);
    }
  };

  const resultColor = (r: string): ChipColor => {
    if (r === 'Win') return 'success';
    if (r === 'Loss') return 'error';
    if (r === 'Breakeven') return 'default';
    if (r === 'Open') return 'info';
    return 'warning';
  };

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h4">Trade Journal</Typography>
          <Typography variant="body2" color="text.secondary">
            Log your gold trades. Lot size auto-computes from balance, risk %, and SL.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            style={{ display: 'none' }}
            onChange={handleFilePick}
          />
          <Button
            variant="outlined"
            startIcon={importing ? <CircularProgress size={16} /> : <UploadIcon />}
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? 'Importing…' : 'Import CSV / Excel'}
          </Button>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExport}
            disabled={trades.length === 0}
          >
            Export CSV
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setOpen(true)}
          >
            Add Trade
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2, whiteSpace: 'pre-line' }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Paper>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Dir</TableCell>
                <TableCell align="right">Entry</TableCell>
                <TableCell align="right">SL</TableCell>
                <TableCell align="right">TP</TableCell>
                <TableCell align="right">Lot</TableCell>
                <TableCell align="right">Close</TableCell>
                <TableCell align="right">R</TableCell>
                <TableCell>Result</TableCell>
                <TableCell align="right">Balance</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {trades.map((t) => (
                <TableRow key={t._id} hover>
                  <TableCell>{t.tradeNumber}</TableCell>
                  <TableCell>{new Date(t.date).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={t.direction}
                      color={t.direction === 'Buy' ? 'success' : 'error'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="right">{t.entry}</TableCell>
                  <TableCell align="right">{t.stopLoss ?? '—'}</TableCell>
                  <TableCell align="right">{t.takeProfit ?? '—'}</TableCell>
                  <TableCell align="right">{t.lotSize}</TableCell>
                  <TableCell align="right">{t.closePrice ?? '—'}</TableCell>
                  <TableCell align="right">{t.rMultiple ?? '—'}</TableCell>
                  <TableCell>
                    <Chip size="small" label={t.result} color={resultColor(t.result)} />
                  </TableCell>
                  <TableCell align="right">
                    {t.balanceAfter ? `$${t.balanceAfter.toFixed(2)}` : '—'}
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => remove(t._id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => openEdit(t)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {trades.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={12}
                    align="center"
                    sx={{ py: 4, color: 'text.secondary' }}
                  >
                    No trades yet — click <strong>Add Trade</strong> to log one, or{' '}
                    <strong>Import CSV / Excel</strong> to bulk load.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      )}

      {/* Add Trade dialog */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Trade</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 6 }}>
              <TextField
                select
                fullWidth
                label="Direction"
                value={form.direction}
                onChange={(e) =>
                  setForm({ ...form, direction: e.target.value as 'Buy' | 'Sell' })
                }
              >
                <MenuItem value="Buy">Buy</MenuItem>
                <MenuItem value="Sell">Sell</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                label="Lot Size (blank = auto)"
                value={form.lotSize}
                onChange={(e) => setForm({ ...form, lotSize: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                required
                label="Entry"
                type="number"
                value={form.entry}
                onChange={(e) => setForm({ ...form, entry: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                label="Stop Loss"
                type="number"
                value={form.stopLoss}
                onChange={(e) => setForm({ ...form, stopLoss: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                label="Take Profit"
                type="number"
                value={form.takeProfit}
                onChange={(e) => setForm({ ...form, takeProfit: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                label="Close Price (blank = open)"
                type="number"
                value={form.closePrice}
                onChange={(e) => setForm({ ...form, closePrice: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                label="Swap / Fee ($)"
                type="number"
                value={form.swapFee}
                onChange={(e) => setForm({ ...form, swapFee: e.target.value })}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                multiline
                rows={2}
                label="Notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={submit} disabled={!form.entry}>
            Save Trade
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit / Close Trade dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingTrade?.result === 'Open'
            ? 'Close Trade'
            : 'Edit Trade'}{' '}
          #{editingTrade?.tradeNumber}
        </DialogTitle>
        <DialogContent>
          {editingTrade && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {editingTrade.direction} {editingTrade.lotSize} lot @ {editingTrade.entry}
                {editingTrade.stopLoss ? ` · SL: ${editingTrade.stopLoss}` : ''}
                {editingTrade.takeProfit ? ` · TP: ${editingTrade.takeProfit}` : ''}
              </Typography>
              <TextField
                fullWidth
                label="Close Price"
                type="number"
                value={editClosePrice}
                onChange={(e) => setEditClosePrice(e.target.value)}
                sx={{ mb: 2 }}
                autoFocus
              />
              <TextField
                fullWidth
                multiline
                rows={2}
                label="Notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveEdit}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!snack}
        autoHideDuration={6000}
        onClose={() => setSnack(null)}
        message={snack ?? ''}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}