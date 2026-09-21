import type { ReactNode } from 'react';
import { Card, CardContent, Typography, Box } from '@mui/material';

type Props = {
  /** Card title, shown in uppercase above the value */
  label: string;
  /** The main number/string displayed large */
  value: ReactNode;
  /** Small caption below the value (was `sub` in Dashboard) */
  sub?: ReactNode;
  /** Optional icon */
  icon?: ReactNode;
  /** Any CSS color string — hex, rgb, or MUI theme path like "primary.main" */
  accent?: string;
};

export function StatCard({ label, value, sub, icon, accent = 'primary.main' }: Props) {
  // If accent is a theme path (contains a dot), pass through as-is; otherwise treat as CSS color
  const accentColor = accent.includes('.') ? accent : accent;

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          {icon && <Box sx={{ color: accentColor, display: 'flex' }}>{icon}</Box>}
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              textTransform: 'uppercase',
              letterSpacing: 1,
              fontWeight: 600,
            }}
          >
            {label}
          </Typography>
        </Box>
        <Typography variant="h4" sx={{ color: accentColor, mb: 0.5 }}>
          {value}
        </Typography>
        {sub && (
          <Typography variant="body2" color="text.secondary">
            {sub}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}