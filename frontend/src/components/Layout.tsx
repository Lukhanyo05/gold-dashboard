import { useState, type ReactNode } from 'react';
import {
  Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  AppBar, Toolbar, Typography, Divider, Button, IconButton, useTheme, useMediaQuery,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  MenuBook as JournalIcon,
  CalendarMonth as CalendarIcon,
  Insights as AnalyticsIcon,
  Checklist as PlaybookIcon,
  Calculate as CalculatorIcon,
  Savings as SavingsIcon,
  AccountBalance as TaxIcon,
  TrendingUp as ProjectionIcon,
  Flag as GoalIcon,
  Newspaper as NewsIcon,
  Psychology as MentorIcon,
  Menu as MenuIcon,
} from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { getStoredUser } from '../api/client';

const DRAWER_WIDTH = 240;

const navItems = [
  { label: 'Dashboard',   path: '/',            icon: <DashboardIcon /> },
  { label: 'Journal',     path: '/journal',     icon: <JournalIcon /> },
  { label: 'Calendar',    path: '/calendar',    icon: <CalendarIcon /> },
  { label: 'Analytics',   path: '/analytics',   icon: <AnalyticsIcon /> },
  { label: 'Playbooks',   path: '/playbooks',   icon: <PlaybookIcon /> },
  { label: 'Goals',       path: '/goals',       icon: <GoalIcon /> },
  { label: 'Market News', path: '/market',      icon: <NewsIcon /> },
  { label: 'Risk Mentor', path: '/risk-mentor', icon: <MentorIcon /> },
  { label: 'Calculator',  path: '/calculator',  icon: <CalculatorIcon /> },
  { label: 'Withdrawals', path: '/withdrawals', icon: <SavingsIcon /> },
  { label: 'Tax Center',  path: '/tax',         icon: <TaxIcon /> },
  { label: 'Projection',  path: '/projection',  icon: <ProjectionIcon /> },
];

export function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const user = getStoredUser();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  const handleNavClick = (path: string) => {
    navigate(path);
    if (isMobile) setMobileOpen(false);
  };

  const drawerContent = (
    <>
      <Toolbar sx={{ px: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Portfolio
        </Typography>
      </Toolbar>
      <Divider />
      <List>
        {navItems.map((item) => (
          <ListItemButton
            key={item.path}
            selected={pathname === item.path}
            onClick={() => handleNavClick(item.path)}
            sx={{
              mx: 1,
              borderRadius: 1.5,
              position: 'relative',
              transition: 'background-color 150ms ease, color 150ms ease',
              '&:hover': {
                bgcolor: 'rgba(201, 162, 75, 0.08)',
              },
              '&.Mui-selected': {
                bgcolor: 'rgba(201, 162, 75, 0.14)',
                color: 'primary.main',
                '&:hover': { bgcolor: 'rgba(201, 162, 75, 0.18)' },
                '& .MuiListItemIcon-root': { color: 'primary.main' },
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  left: 0,
                  top: '22%',
                  bottom: '22%',
                  width: 3,
                  borderRadius: 4,
                  bgcolor: 'primary.main',
                },
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
    </>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { md: `${DRAWER_WIDTH}px` },
          bgcolor: 'background.paper',
          borderBottom: '1px solid #E6D9BC',
        }}
      >
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <IconButton
              color="inherit"
              edge="start"
              onClick={() => setMobileOpen(true)}
              sx={{ display: { md: 'none' } }}
            >
              <MenuIcon />
            </IconButton>
            <Typography
              variant="h6"
              noWrap
              sx={{ color: 'primary.main', fontSize: { xs: '1rem', sm: '1.25rem' } }}
            >
              🥇 Gold Trading Company
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 } }}>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ display: { xs: 'none', sm: 'block' } }}
            >
              {user?.email ?? ''}
            </Typography>
            <Button size="small" onClick={handleLogout}>
              Logout
            </Button>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Mobile: temporary drawer that overlays and closes after navigating */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            bgcolor: 'background.paper',
            borderRight: '1px solid #E6D9BC',
          },
        }}
      >
        {drawerContent}
      </Drawer>

      {/* Desktop: permanent drawer, always visible */}
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          display: { xs: 'none', md: 'block' },
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            bgcolor: 'background.paper',
            borderRight: '1px solid #E6D9BC',
          },
        }}
      >
        {drawerContent}
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3 },
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          maxWidth: '100%',
          overflowX: 'hidden',
          mt: 8,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
