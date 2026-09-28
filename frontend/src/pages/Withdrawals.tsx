import { useEffect, useState } from 'react';
import {
  Box, Paper, Typography, Button, Grid, TextField, MenuItem,
  Table, TableBody, TableCell, TableHead, TableRow, Chip, Alert,
} from '@mui/material';
import type { Withdrawal, Account, WithdrawalAllocation } from '../api/client';
import { getWithdrawals, createWithdrawal, getAccount } from '../api/client';

interface FormState {
  amount: string;
  type: 'Withdrawal' | 'Deposit';
  notes: string;
  allocation: WithdrawalAllocation | '';
}

export function Withdrawals() {
  const [list, setList] = useState<Withdrawal[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [form, setForm] = useState<FormState>({
    amount: '',
    type: 'Withdrawal',
    notes: '',
    allocation: '',
  });
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    Promise.all([getWithdrawals(), getAccount()])
      .then(([w, a]) => {
        setList(w);
        setAccount(a);
      })
      .catch((e) => {
        const err = e as { message?: string };
        setError(err?.message ?? 'Failed to load');
      });

  useEffect(() => { load(); }, []);

  const allocationTotals: [string, number][] = (() => {
    const totals = new Map<string, number>();
    for (const w of list) {
      if (w.type !== 'Withdrawal') continue;
      const key = w.allocation ?? 'Not tracked';
      totals.set(key, (totals.get(key) ?? 0) + w.amount);
    }
    return [...totals.entries()];
  })();

  const submit = async () => {
    try {
      setError(null);
      await createWithdrawal({
        amount: parseFloat(form.amount),
        type: form.type,
        notes: form.notes,
        allocation: form.type === 'Withdrawal' && form.allocation ? form.allocation : null,
      });
      setForm({ amount: '', type: 'Withdrawal', notes: '', allocation: '' });
      load();
    } catch (e) {
      const err = e as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      setError(err?.response?.data?.error ?? err?.message ?? 'Unknown error');
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Withdrawals & Deposits</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Pay yourself from profit while keeping the company capital compounding.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Record Transaction</Typography>
            <TextField
              fullWidth
              select
              label="Type"
              value={form.type}
              onChange={(e) =>
                setForm({ ...form, type: e.target.value as 'Withdrawal' | 'Deposit' })
              }
              sx={{ mb: 2 }}
            >
              <MenuItem value="Withdrawal">Withdrawal (pay yourself)</MenuItem>
              <MenuItem value="Deposit">Deposit (add capital)</MenuItem>
            </TextField>
            <TextField
              fullWidth
              label="Amount ($)"
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              sx={{ mb: 2 }}
            />
            {form.type === 'Withdrawal' && (
              <TextField
                fullWidth
                select
                label="Where did it go? (optional)"
                value={form.allocation}
                onChange={(e) => setForm({ ...form, allocation: e.target.value as WithdrawalAllocation | '' })}
                sx={{ mb: 2 }}
              >
                <MenuItem value="">Not tracked</MenuItem>
                <MenuItem value="Reinvested">Reinvested (other venture)</MenuItem>
                <MenuItem value="Saved">Saved</MenuItem>
                <MenuItem value="Other">Other / personal use</MenuItem>
              </TextField>
            )}
            <TextField
              fullWidth
              label="Notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              sx={{ mb: 2 }}
            />
            <Button
              fullWidth
              variant="contained"
              onClick={submit}
              disabled={!form.amount}
            >
              Save
            </Button>
          </Paper>

          {account && (
            <Paper sx={{ p: 3, mt: 2 }}>
              <Typography variant="subtitle2" color="text.secondary">
                CURRENT BALANCE
              </Typography>
              <Typography variant="h4" color="primary.main">
                ${account.currentBalance.toFixed(2)}
              </Typography>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2 }}>
                TOTAL WITHDRAWN
              </Typography>
              <Typography variant="h6">${account.totalWithdrawn.toFixed(2)}</Typography>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2 }}>
                TAX RESERVE
              </Typography>
              <Typography variant="h6" color="info.main">
                ${account.taxReserve.toFixed(2)}
              </Typography>
            </Paper>
          )}

          {allocationTotals.length > 0 && (
            <Paper sx={{ p: 3, mt: 2 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                TREASURY — WHERE WITHDRAWALS WENT
              </Typography>
              {allocationTotals.map(([label, total]) => (
                <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                  <Typography variant="body2">{label}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>${total.toFixed(2)}</Typography>
                </Box>
              ))}
            </Paper>
          )}
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Paper>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Allocation</TableCell>
                  <TableCell>Notes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {list.map((w) => (
                  <TableRow key={w._id}>
                    <TableCell>{new Date(w.date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={w.type}
                        color={w.type === 'Withdrawal' ? 'warning' : 'success'}
                      />
                    </TableCell>
                    <TableCell align="right">${w.amount.toFixed(2)}</TableCell>
                    <TableCell>{w.allocation ?? '—'}</TableCell>
                    <TableCell>{w.notes ?? '—'}</TableCell>
                  </TableRow>
                ))}
                {list.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      align="center"
                      sx={{ py: 4, color: 'text.secondary' }}
                    >
                      No transactions yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}