import { useEffect, useRef, useState } from 'react';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell,
  TableHead, TableRow, Chip, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, Grid, Alert,
  CircularProgress, Snackbar, Autocomplete, ToggleButton, ToggleButtonGroup,
  FormControlLabel, Checkbox, FormGroup,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
  Image as ImageIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import type { Trade, TradeSymbol, Playbook } from '../api/client';
import {
  getTrades, createTrade, deleteTrade, updateTrade,
  downloadTradesCSV, importTradesFile, getTradeTags, getPlaybooks,
} from '../api/client';

const emptyForm = {
  symbol: 'GOLD' as TradeSymbol,
  direction: 'Buy' as 'Buy' | 'Sell',
  entry: '',
  stopLoss: '',
  takeProfit: '',
  lotSize: '',
  swapFee: '0',
  closePrice: '',
  notes: '',
  tags: [] as string[],
  setup: '',
  followedPlan: null as boolean | null,
  screenshot: null as string | null,
};

// Max source-image dimension before we downscale for the screenshot upload —
// keeps the base64 payload well under the backend's size cap without the
// person needing to resize anything themselves.
const SCREENSHOT_MAX_DIM = 1280;

function readImageAsCompressedDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error('Could not read image'));
      img.onload = () => {
        const scale = Math.min(1, SCREENSHOT_MAX_DIM / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

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
  const [importSince, setImportSince] = useState('2026-08-24');
  const [symbolFilter, setSymbolFilter] = useState<TradeSymbol | 'All'>('All');
  const [tagFilter, setTagFilter] = useState<string>('All');
  const [allTags, setAllTags] = useState<string[]>([]);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editSetup, setEditSetup] = useState('');
  const [editFollowedPlan, setEditFollowedPlan] = useState<boolean | null>(null);
  const [editScreenshot, setEditScreenshot] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [editChecklist, setEditChecklist] = useState<Record<string, boolean>>({});
  const [screenshotBusy, setScreenshotBusy] = useState(false);
  const [viewScreenshot, setViewScreenshot] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const editScreenshotInputRef = useRef<HTMLInputElement>(null);

  const activePlaybook = playbooks.find((p) => p.name === form.setup);
  const activeEditPlaybook = playbooks.find((p) => p.name === editSetup);

  const load = (symbol: TradeSymbol | 'All' = symbolFilter) => {
    setLoading(true);
    return getTrades(symbol)
      .then(setTrades)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  const loadMeta = () => {
    getTradeTags().then(setAllTags).catch(() => {});
    getPlaybooks().then(setPlaybooks).catch(() => {});
  };

  useEffect(() => {
    load(symbolFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolFilter]);

  useEffect(() => {
    loadMeta();
  }, []);

  // Reset the checklist whenever the selected playbook changes, and
  // auto-derive followedPlan from it once every rule has a checked answer.
  useEffect(() => {
    if (!activePlaybook || activePlaybook.rules.length === 0) {
      setChecklist({});
      return;
    }
    setChecklist(Object.fromEntries(activePlaybook.rules.map((r) => [r, false])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlaybook?._id]);

  useEffect(() => {
    if (!activePlaybook || activePlaybook.rules.length === 0) return;
    const allChecked = activePlaybook.rules.every((r) => checklist[r]);
    setForm((f) => (f.followedPlan === allChecked ? f : { ...f, followedPlan: allChecked }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checklist, activePlaybook?._id]);

  useEffect(() => {
    if (!activeEditPlaybook || activeEditPlaybook.rules.length === 0) {
      setEditChecklist({});
      return;
    }
    setEditChecklist(Object.fromEntries(activeEditPlaybook.rules.map((r) => [r, false])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEditPlaybook?._id, editOpen]);

  useEffect(() => {
    if (!activeEditPlaybook || activeEditPlaybook.rules.length === 0) return;
    const allChecked = activeEditPlaybook.rules.every((r) => editChecklist[r]);
    setEditFollowedPlan((prev) => (prev === allChecked ? prev : allChecked));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editChecklist, activeEditPlaybook?._id]);

  const visibleTrades =
    tagFilter === 'All' ? trades : trades.filter((t) => (t.tags ?? []).includes(tagFilter));

  const submit = async () => {
    try {
      setError(null);
      await createTrade({
        symbol: form.symbol,
        direction: form.direction,
        entry: parseFloat(form.entry),
        stopLoss: form.stopLoss ? parseFloat(form.stopLoss) : null,
        takeProfit: form.takeProfit ? parseFloat(form.takeProfit) : null,
        lotSize: form.lotSize ? parseFloat(form.lotSize) : undefined,
        swapFee: parseFloat(form.swapFee || '0'),
        closePrice: form.closePrice ? parseFloat(form.closePrice) : null,
        notes: form.notes,
        tags: form.tags,
        setup: form.setup || null,
        followedPlan: form.followedPlan,
        screenshot: form.screenshot,
      } as Partial<Trade>);
      setOpen(false);
      setForm(emptyForm);
      load();
      loadMeta();
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
    setEditTags(t.tags ?? []);
    setEditSetup(t.setup ?? '');
    setEditFollowedPlan(t.followedPlan ?? null);
    setEditScreenshot(t.screenshot ?? null);
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editingTrade) return;
    try {
      setError(null);
      await updateTrade(editingTrade._id, {
        closePrice: editClosePrice ? parseFloat(editClosePrice) : null,
        notes: editNotes,
        tags: editTags,
        setup: editSetup || null,
        followedPlan: editFollowedPlan,
        screenshot: editScreenshot,
      } as Partial<Trade>);
      setEditOpen(false);
      setEditingTrade(null);
      load();
      loadMeta();
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
      const result = await importTradesFile(file, importSince || undefined);
      load();
      setSnack(
        `Imported ${result.inserted} trade(s).` +
          (result.duplicates ? ` ${result.duplicates} already-imported duplicate(s) skipped.` : '') +
          (result.skipped > 0 ? ` ${result.skipped} skipped total.` : '') +
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

  const handleScreenshotPick = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'add' | 'edit'
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setScreenshotBusy(true);
    setError(null);
    try {
      const dataUrl = await readImageAsCompressedDataUrl(file);
      if (target === 'add') setForm((f) => ({ ...f, screenshot: dataUrl }));
      else setEditScreenshot(dataUrl);
    } catch (err) {
      const e2 = err as { message?: string };
      setError(e2?.message ?? 'Could not process image');
    } finally {
      setScreenshotBusy(false);
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
            Log your trades. Lot size auto-computes from balance, risk %, and SL.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            select
            size="small"
            label="Symbol"
            value={symbolFilter}
            onChange={(e) => setSymbolFilter(e.target.value as TradeSymbol | 'All')}
            sx={{ width: 120 }}
          >
            <MenuItem value="All">All</MenuItem>
            <MenuItem value="GOLD">GOLD</MenuItem>
            <MenuItem value="ETHUSD">ETHUSD</MenuItem>
          </TextField>
          <TextField
            select
            size="small"
            label="Tag"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            sx={{ width: 140 }}
          >
            <MenuItem value="All">All tags</MenuItem>
            {allTags.map((tag) => (
              <MenuItem key={tag} value={tag}>
                {tag}
              </MenuItem>
            ))}
          </TextField>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            style={{ display: 'none' }}
            onChange={handleFilePick}
          />
          <TextField
            size="small"
            type="date"
            label="Import from"
            value={importSince}
            onChange={(e) => setImportSince(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ width: 160 }}
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
                <TableCell>Symbol</TableCell>
                <TableCell>Dir</TableCell>
                <TableCell align="right">Entry</TableCell>
                <TableCell align="right">SL</TableCell>
                <TableCell align="right">TP</TableCell>
                <TableCell align="right">Lot</TableCell>
                <TableCell align="right">Close</TableCell>
                <TableCell align="right">R</TableCell>
                <TableCell align="right">P&amp;L</TableCell>
                <TableCell>Result</TableCell>
                <TableCell>Setup</TableCell>
                <TableCell>Tags</TableCell>
                <TableCell align="center">Shot</TableCell>
                <TableCell align="right">Balance</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleTrades.map((t) => (
                <TableRow key={t._id} hover>
                  <TableCell>{t.tradeNumber}</TableCell>
                  <TableCell>{new Date(t.date).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={t.symbol ?? 'GOLD'}
                      color={t.symbol === 'ETHUSD' ? 'secondary' : 'primary'}
                      variant="outlined"
                    />
                  </TableCell>
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
                  <TableCell
                    align="right"
                    sx={{
                      fontWeight: 600,
                      color:
                        t.balanceAfter == null
                          ? 'text.secondary'
                          : t.balanceAfter - t.balanceBefore >= 0
                          ? 'success.main'
                          : 'error.main',
                    }}
                  >
                    {t.balanceAfter == null
                      ? '—'
                      : `${t.balanceAfter - t.balanceBefore >= 0 ? '+' : ''}$${(
                          t.balanceAfter - t.balanceBefore
                        ).toFixed(2)}`}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={t.result} color={resultColor(t.result)} />
                  </TableCell>
                  <TableCell>
                    {t.setup ? (
                      <Chip size="small" label={t.setup} variant="outlined" />
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    {(t.tags ?? []).map((tag) => (
                      <Chip key={tag} size="small" label={tag} sx={{ mr: 0.5, mb: 0.5 }} />
                    ))}
                  </TableCell>
                  <TableCell align="center">
                    {t.screenshot ? (
                      <IconButton size="small" onClick={() => setViewScreenshot(t.screenshot!)}>
                        <ImageIcon fontSize="small" color="primary" />
                      </IconButton>
                    ) : (
                      '—'
                    )}
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
              {visibleTrades.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={17}
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
                label="Symbol"
                value={form.symbol}
                onChange={(e) =>
                  setForm({ ...form, symbol: e.target.value as TradeSymbol })
                }
              >
                <MenuItem value="GOLD">GOLD</MenuItem>
                <MenuItem value="ETHUSD">ETHUSD</MenuItem>
              </TextField>
            </Grid>
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
                disabled={form.symbol === 'ETHUSD'}
                helperText={
                  form.symbol === 'ETHUSD'
                    ? 'Manual close not supported for ETHUSD yet — import from broker report'
                    : undefined
                }
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
            <Grid size={{ xs: 6 }}>
              <Autocomplete
                freeSolo
                options={playbooks.map((p) => p.name)}
                value={form.setup}
                onInputChange={(_e, val) => setForm({ ...form, setup: val })}
                renderInput={(params) => <TextField {...params} label="Setup / Playbook" />}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              {activePlaybook && activePlaybook.rules.length > 0 ? (
                <Chip
                  size="small"
                  label={form.followedPlan ? 'Plan followed ✓' : 'Check all rules below'}
                  color={form.followedPlan ? 'success' : 'default'}
                  sx={{ mt: 1 }}
                />
              ) : (
                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  size="small"
                  value={form.followedPlan}
                  onChange={(_e, val) => setForm({ ...form, followedPlan: val })}
                  sx={{ mt: 1 }}
                >
                  <ToggleButton value={true}>Followed plan</ToggleButton>
                  <ToggleButton value={false}>Broke rules</ToggleButton>
                </ToggleButtonGroup>
              )}
            </Grid>
            {activePlaybook && activePlaybook.rules.length > 0 && (
              <Grid size={{ xs: 12 }}>
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    PRE-TRADE CHECKLIST — {activePlaybook.name}
                  </Typography>
                  <FormGroup>
                    {activePlaybook.rules.map((rule) => (
                      <FormControlLabel
                        key={rule}
                        control={
                          <Checkbox
                            size="small"
                            checked={!!checklist[rule]}
                            onChange={(e) =>
                              setChecklist((c) => ({ ...c, [rule]: e.target.checked }))
                            }
                          />
                        }
                        label={rule}
                      />
                    ))}
                  </FormGroup>
                </Paper>
              </Grid>
            )}
            <Grid size={{ xs: 12 }}>
              <input
                ref={screenshotInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => handleScreenshotPick(e, 'add')}
              />
              <Button
                size="small"
                variant="outlined"
                startIcon={screenshotBusy ? <CircularProgress size={14} /> : <ImageIcon />}
                onClick={() => screenshotInputRef.current?.click()}
                disabled={screenshotBusy}
              >
                {form.screenshot ? 'Replace Screenshot' : 'Attach Screenshot'}
              </Button>
              {form.screenshot && (
                <Box sx={{ position: 'relative', display: 'inline-block', ml: 2, verticalAlign: 'middle' }}>
                  <img
                    src={form.screenshot}
                    alt="Trade screenshot preview"
                    style={{ height: 48, borderRadius: 4, display: 'block' }}
                  />
                  <IconButton
                    size="small"
                    onClick={() => setForm((f) => ({ ...f, screenshot: null }))}
                    sx={{
                      position: 'absolute', top: -10, right: -10, bgcolor: 'background.paper',
                      boxShadow: 1, p: 0.25, '&:hover': { bgcolor: 'background.paper' },
                    }}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Box>
              )}
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Autocomplete
                multiple
                freeSolo
                options={allTags}
                value={form.tags}
                onChange={(_e, val) => setForm({ ...form, tags: val })}
                renderValue={(value, getItemProps) =>
                  value.map((option, index) => (
                    <Chip size="small" label={option} {...getItemProps({ index })} key={option} />
                  ))
                }
                renderInput={(params) => (
                  <TextField {...params} label="Tags (press Enter to add)" />
                )}
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
                {editingTrade.symbol ?? 'GOLD'} · {editingTrade.direction} {editingTrade.lotSize} lot @ {editingTrade.entry}
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
                disabled={editingTrade.symbol === 'ETHUSD'}
                helperText={
                  editingTrade.symbol === 'ETHUSD'
                    ? 'Manual close not supported for ETHUSD yet — re-import from broker report instead'
                    : undefined
                }
              />
              <Autocomplete
                freeSolo
                options={playbooks.map((p) => p.name)}
                value={editSetup}
                onInputChange={(_e, val) => setEditSetup(val)}
                renderInput={(params) => (
                  <TextField {...params} label="Setup / Playbook" sx={{ mb: 2 }} />
                )}
              />
              {activeEditPlaybook && activeEditPlaybook.rules.length > 0 ? (
                <Box sx={{ mb: 2 }}>
                  <Chip
                    size="small"
                    label={editFollowedPlan ? 'Plan followed ✓' : 'Check all rules below'}
                    color={editFollowedPlan ? 'success' : 'default'}
                  />
                  <Paper variant="outlined" sx={{ p: 1.5, mt: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      PRE-TRADE CHECKLIST — {activeEditPlaybook.name}
                    </Typography>
                    <FormGroup>
                      {activeEditPlaybook.rules.map((rule) => (
                        <FormControlLabel
                          key={rule}
                          control={
                            <Checkbox
                              size="small"
                              checked={!!editChecklist[rule]}
                              onChange={(e) =>
                                setEditChecklist((c) => ({ ...c, [rule]: e.target.checked }))
                              }
                            />
                          }
                          label={rule}
                        />
                      ))}
                    </FormGroup>
                  </Paper>
                </Box>
              ) : (
                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  size="small"
                  value={editFollowedPlan}
                  onChange={(_e, val) => setEditFollowedPlan(val)}
                  sx={{ mb: 2 }}
                >
                  <ToggleButton value={true}>Followed plan</ToggleButton>
                  <ToggleButton value={false}>Broke rules</ToggleButton>
                </ToggleButtonGroup>
              )}
              <Box sx={{ mb: 2 }}>
                <input
                  ref={editScreenshotInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => handleScreenshotPick(e, 'edit')}
                />
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={screenshotBusy ? <CircularProgress size={14} /> : <ImageIcon />}
                  onClick={() => editScreenshotInputRef.current?.click()}
                  disabled={screenshotBusy}
                >
                  {editScreenshot ? 'Replace Screenshot' : 'Attach Screenshot'}
                </Button>
                {editScreenshot && (
                  <Box sx={{ position: 'relative', display: 'inline-block', ml: 2, verticalAlign: 'middle' }}>
                    <img
                      src={editScreenshot}
                      alt="Trade screenshot preview"
                      style={{ height: 48, borderRadius: 4, display: 'block' }}
                    />
                    <IconButton
                      size="small"
                      onClick={() => setEditScreenshot(null)}
                      sx={{
                        position: 'absolute', top: -10, right: -10, bgcolor: 'background.paper',
                        boxShadow: 1, p: 0.25, '&:hover': { bgcolor: 'background.paper' },
                      }}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Box>
                )}
              </Box>
              <Autocomplete
                multiple
                freeSolo
                options={allTags}
                value={editTags}
                onChange={(_e, val) => setEditTags(val)}
                renderValue={(value, getItemProps) =>
                  value.map((option, index) => (
                    <Chip size="small" label={option} {...getItemProps({ index })} key={option} />
                  ))
                }
                renderInput={(params) => (
                  <TextField {...params} label="Tags (press Enter to add)" sx={{ mb: 2 }} />
                )}
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

      {/* Screenshot viewer */}
      <Dialog open={!!viewScreenshot} onClose={() => setViewScreenshot(null)} maxWidth="md">
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Trade Screenshot
          <IconButton size="small" onClick={() => setViewScreenshot(null)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {viewScreenshot && (
            <img
              src={viewScreenshot}
              alt="Trade screenshot"
              style={{ maxWidth: '100%', display: 'block' }}
            />
          )}
        </DialogContent>
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