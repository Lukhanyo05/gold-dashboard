import { useEffect, useState } from 'react';
import {
  Box, Paper, Typography, Button, Grid, TextField, MenuItem,
  Table, TableBody, TableCell, TableHead, TableRow, Chip, Alert,
} from '@mui/material';
import type { Withdrawal, Account } from '../api/client';
import { getWithdrawals, createWithdrawal, getAccount } from '../api/client';

interface FormState {
  amount: string;
  type: 'Withdrawal' | 'Deposit';
  notes: string;
}

export function Withdrawals() {
  const [list, setList] = useState<Withdrawal[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [form, setForm] = useState<FormState>({
    amount: '',
    type: 'Withdrawal',
    notes: '',
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

  const submit = async () => {
    try {
      setError(null);
      await createWithdrawal({
        amount: parseFloat(form.amount),
        type: form.type,
        notes: form.notes,
      });
      setForm({ amount: '', type: 'Withdrawal', notes: '' });
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
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Paper>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Amount</TableCell>
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
                    <TableCell>{w.notes ?? '—'}</TableCell>
                  </TableRow>
                ))}
                {list.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
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