import { useEffect, useState } from 'react';
import {
  Box, Paper, Typography, Grid, List, ListItem, ListItemText, Link, Chip,
  CircularProgress, Divider,
} from '@mui/material';
import type { NewsItem, MacroEvent, ForexFactoryEvent } from '../api/client';
import { getGoldNews, getMacroEvents, getForexFactoryCalendar } from '../api/client';

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

function ffImpactColor(impact: ForexFactoryEvent['impact']): 'error' | 'warning' | 'default' {
  if (impact === 'High') return 'error';
  if (impact === 'Medium') return 'warning';
  return 'default';
}

export function Market() {
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [events, setEvents] = useState<MacroEvent[] | null>(null);
  const [ffEvents, setFfEvents] = useState<ForexFactoryEvent[] | null>(null);
  const [ffError, setFfError] = useState<string | null>(null);
  const [ffStale, setFfStale] = useState(false);

  useEffect(() => {
    getGoldNews().then(setNews).catch(() => setNewsError('Could not load news right now — try again shortly.'));
    getMacroEvents(3).then(setEvents).catch(() => {});
    getForexFactoryCalendar()
      .then((d) => {
        setFfEvents(d.events);
        setFfStale(!!d.stale);
      })
      .catch(() => setFfError('Could not load the Forex Factory calendar right now — try again shortly.'));
  }, []);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Market</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Gold headlines and the scheduled macro events most likely to move XAUUSD.
      </Typography>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Key Events</Typography>
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
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
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

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Paper sx={{ p: 3, height: '100%', maxHeight: 640, overflow: 'auto' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
              <Typography variant="h6">This Week — Forex Factory</Typography>
              {ffStale && <Chip size="small" label="Cached" variant="outlined" />}
            </Box>
            {!ffEvents && !ffError && <CircularProgress size={20} />}
            {ffError && <Typography color="error.main">{ffError}</Typography>}
            {ffEvents && ffEvents.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No medium/high-impact USD events left this week.
              </Typography>
            )}
            <List dense disablePadding>
              {ffEvents?.map((e, i) => (
                <Box key={`${e.date}-${e.title}-${i}`}>
                  <ListItem disableGutters sx={{ alignItems: 'flex-start' }}>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Chip size="small" label={e.impact} color={ffImpactColor(e.impact)} variant="outlined" />
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{e.title}</Typography>
                        </Box>
                      }
                      secondary={
                        <>
                          <Typography variant="caption" color="text.secondary" component="span">
                            {new Date(e.date).toLocaleString(undefined, {
                              weekday: 'short', month: 'short', day: 'numeric',
                              hour: 'numeric', minute: '2-digit',
                            })}
                          </Typography>
                          {(e.forecast || e.previous) && (
                            <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
                              {e.forecast && `Forecast: ${e.forecast}`}
                              {e.forecast && e.previous && ' · '}
                              {e.previous && `Previous: ${e.previous}`}
                            </Typography>
                          )}
                        </>
                      }
                    />
                  </ListItem>
                  {ffEvents && i < ffEvents.length - 1 && <Divider component="li" sx={{ my: 1 }} />}
                </Box>
              ))}
            </List>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
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
