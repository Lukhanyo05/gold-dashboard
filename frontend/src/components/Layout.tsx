import type { ReactNode } from 'react';
import {
  Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  AppBar, Toolbar, Typography, Divider, Button,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  MenuBook as JournalIcon,
  Calculate as CalculatorIcon,
  Savings as SavingsIcon,
  AccountBalance as TaxIcon,
  TrendingUp as ProjectionIcon,
} from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import { getStoredUser } from '../api/client';

const DRAWER_WIDTH = 240;

const navItems = [
  { label: 'Dashboard',   path: '/',            icon: <DashboardIcon /> },
  { label: 'Journal',     path: '/journal',     icon: <JournalIcon /> },
  { label: 'Calculator',  path: '/calculator',  icon: <CalculatorIcon /> },
  { label: 'Withdrawals', path: '/withdrawals', icon: <SavingsIcon /> },
  { label: 'Tax Center',  path: '/tax',         icon: <TaxIcon /> },
  { label: 'Projection',  path: '/projection',  icon: <ProjectionIcon /> },
];

export function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const user = getStoredUser();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          width: `calc(100% - ${DRAWER_WIDTH}px)`,
          ml: `${DRAWER_WIDTH}px`,
          bgcolor: 'background.paper',
          borderBottom: '1px solid #21262D',
        }}
      >
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="h6" sx={{ color: 'primary.main' }}>
            🥇 Gold Trading Company
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {user?.email ?? ''}
            </Typography>
            <Button size="small" onClick={handleLogout}>
              Logout
            </Button>
          </Box>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            bgcolor: 'background.paper',
            borderRight: '1px solid #21262D',
          },
        }}
      >
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
              onClick={() => navigate(item.path)}
              sx={{
                mx: 1,
                borderRadius: 1,
                '&.Mui-selected': {
                  bgcolor: 'rgba(212, 175, 55, 0.12)',
                  color: 'primary.main',
                  '& .MuiListItemIcon-root': { color: 'primary.main' },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: `calc(100% - ${DRAWER_WIDTH}px)`,
          mt: 8,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}