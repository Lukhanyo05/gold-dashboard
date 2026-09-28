import { useEffect, useState } from 'react';
import {
  Box, Paper, Typography, Grid, List, ListItem, ListItemText, Link, Chip,
  CircularProgress, Divider,
} from '@mui/material';
import type { NewsItem, MacroEvent } from '../api/client';
import { getGoldNews, getMacroEvents } from '../api/client';

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (isNaN(t)) return '';
  const diffMin = Math.round((Date.now() - t) / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.round(diffH / 24)}d ago`;
}

function daysUntil(iso: string): number {
  const target = new Date(`${iso}T00:00:00Z`).getTime();
  return Math.round((target - Date.now()) / 86400000);
}

export function Market() {
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [events, setEvents] = useState<MacroEvent[] | null>(null);

  useEffect(() => {
    getGoldNews().then(setNews).catch(() => setNewsError('Could not load news right now — try again shortly.'));
    getMacroEvents(3).then(setEvents).catch(() => {});
  }, []);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Market</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Gold headlines and the scheduled macro events most likely to move XAUUSD.
      </Typography>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 5 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Upcoming Events</Typography>
            {!events && <CircularProgress size={20} />}
            {events && events.length === 0 && (
              <Typography variant="body2" color="text.secondary">No upcoming events in this window.</Typography>
            )}
            <List dense disablePadding>
              {events?.map((e, i) => {
                const d = daysUntil(e.date);
                return (
                  <Box key={`${e.date}-${i}`}>
                    <ListItem disableGutters sx={{ alignItems: 'flex-start' }}>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip
                              size="small"
                              label={e.category}
                              color={e.category === 'FOMC' ? 'warning' : 'info'}
                              variant="outlined"
                            />
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{e.label}</Typography>
                          </Box>
                        }
                        secondary={
                          <>
                            <Typography variant="caption" color="text.secondary" component="span">
                              {new Date(`${e.date}T00:00:00Z`).toLocaleDateString(undefined, {
                                weekday: 'short', month: 'short', day: 'numeric',
                              })}
                              {' · '}
                              {d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `in ${d} days`}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
                              {e.note}
                            </Typography>
                          </>
                        }
                      />
                    </ListItem>
                    {i < events.length - 1 && <Divider component="li" sx={{ my: 1 }} />}
                  </Box>
                );
              })}
            </List>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 7 }}>
          <Paper sx={{ p: 3, maxHeight: 640, overflow: 'auto' }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Gold News</Typography>
            {!news && !newsError && <CircularProgress size={20} />}
            {newsError && <Typography color="error.main">{newsError}</Typography>}
            {news && news.length === 0 && (
              <Typography variant="body2" color="text.secondary">No headlines available right now.</Typography>
            )}
            <List dense disablePadding>
              {news?.map((item, i) => (
                <Box key={item.link + i}>
                  <ListItem disableGutters>
                    <ListItemText
                      primary={
                        <Link href={item.link} target="_blank" rel="noopener noreferrer" underline="hover" color="inherit">
                          {item.title}
                        </Link>
                      }
                      secondary={
                        <Typography variant="caption" color="text.secondary">
                          {item.source}{item.pubDate ? ` · ${timeAgo(item.pubDate)}` : ''}
                        </Typography>
                      }
                    />
                  </ListItem>
                  {i < news.length - 1 && <Divider component="li" />}
                </Box>
              ))}
            </List>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
