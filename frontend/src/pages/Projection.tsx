import { useEffect, useState } from 'react';
import {
  Box, Paper, Typography, TextField, Grid, Table, TableBody,
  TableCell, TableHead, TableRow,
} from '@mui/material';
import type { ProjectionResult } from '../api/client';
import { getProjection } from '../api/client';

export function Projection() {
  const [monthlyPnL, setMonthlyPnL] = useState(100);
  const [result, setResult] = useState<ProjectionResult | null>(null);

  const run = async (v: number) => {
    setMonthlyPnL(v);
    if (v <= 0) {
      setResult(null);
      return;
    }
    const r = await getProjection(v);
    setResult(r);
  };

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const r = await getProjection(100);
      if (!cancelled) setResult(r);
    };
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Projection to $1,000,000
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Assumes 30% of monthly profit withdrawn, 70% compounded back into capital.
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 3 }}>
            <TextField
              fullWidth
              label="Avg Monthly P/L ($)"
              type="number"
              value={monthlyPnL}
              onChange={(e) => run(parseFloat(e.target.value) || 0)}
            />
            {result && (
              <>
                <Box sx={{ mt: 3 }}>
                  <Typography variant="caption" color="text.secondary">
                    MONTHS TO $1M
                  </Typography>
                  <Typography variant="h3" color="primary.main">
                    {result.monthsToTarget ?? 'N/A'}
                  </Typography>
                </Box>
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    YEARS
                  </Typography>
                  <Typography variant="h5">
                    {result.yearsToTarget ?? 'N/A'}
                  </Typography>
                </Box>
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    TOTAL WITHDRAWN EN ROUTE
                  </Typography>
                  <Typography variant="h5" color="success.main">
                    ${result.totalWithdrawn.toLocaleString()}
                  </Typography>
                </Box>
              </>
            )}
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Paper sx={{ maxHeight: 500, overflow: 'auto' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Month</TableCell>
                  <TableCell align="right">Start</TableCell>
                  <TableCell align="right">P/L</TableCell>
                  <TableCell align="right">Withdraw</TableCell>
                  <TableCell align="right">End Balance</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {result?.schedule.slice(0, 120).map((m) => (
                  <TableRow key={m.month}>
                    <TableCell>{m.month}</TableCell>
                    <TableCell align="right">
                      ${m.start.toLocaleString()}
                    </TableCell>
                    <TableCell align="right" sx={{ color: 'success.main' }}>
                      +${m.pnl.toLocaleString()}
                    </TableCell>
                    <TableCell align="right" sx={{ color: 'warning.main' }}>
                      -${m.withdrawal.toLocaleString()}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      ${m.end.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}