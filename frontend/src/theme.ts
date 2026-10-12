import { createTheme, alpha } from '@mui/material/styles';

// A private ledger, not a dev-tool dashboard: warm, umber-toned darks
// instead of the flat blue-black of a typical SaaS theme, with an antique
// (not neon) gold as the single accent — this app's own stated identity
// (🥇 Gold Trading Company), not a generic palette pick.
const gold = '#C9A24B';
const goldDim = '#8A6E2F';
const goldLight = '#E0C57E';
const bgVoid = '#140F0A';
const bgPanel = '#1C160F';
const borderColor = '#332818';
const parchment = '#EDE3CC';
const textSecondary = '#AC9C7C';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: gold, dark: goldDim, light: goldLight, contrastText: '#1A1409' },
    secondary: { main: '#7FA6C9' },
    success: { main: '#5CB85C' },
    error: { main: '#E2574C' },
    warning: { main: '#D99A3D' },
    info: { main: '#7FA6C9' },
    background: {
      default: bgVoid,
      paper: bgPanel,
    },
    text: {
      primary: parchment,
      secondary: textSecondary,
    },
    divider: borderColor,
  },
  typography: {
    fontFamily: '"Inter", system-ui, sans-serif',
    // Fraunces carries the page titles and every large figure (balances,
    // P&L, prices) — one deliberate typographic moment, kept out of body
    // text and tables so it reads as considered rather than decorative.
    h1: { fontFamily: '"Fraunces", serif' },
    h2: { fontFamily: '"Fraunces", serif' },
    h3: { fontFamily: '"Fraunces", serif', fontWeight: 600 },
    h4: { fontFamily: '"Fraunces", serif', fontWeight: 600, letterSpacing: '-0.01em' },
    h5: { fontFamily: '"Fraunces", serif', fontWeight: 600 },
    h6: { fontFamily: '"Fraunces", serif', fontWeight: 600 },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: bgVoid,
          backgroundImage:
            `radial-gradient(ellipse 1100px 760px at 12% -8%, ${alpha(gold, 0.08)}, transparent 60%), ` +
            `radial-gradient(ellipse 900px 680px at 105% 0%, ${alpha('#7FA6C9', 0.05)}, transparent 55%)`,
          backgroundAttachment: 'fixed',
          backgroundRepeat: 'no-repeat',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: bgPanel,
          backgroundImage: `linear-gradient(180deg, ${alpha('#FFFFFF', 0.03)}, transparent 140px)`,
          border: `1px solid ${borderColor}`,
          borderRadius: 14,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 8,
          transition:
            'transform 150ms cubic-bezier(.4,0,.2,1), box-shadow 150ms ease, background-color 150ms ease, border-color 150ms ease',
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            transform: 'translateY(-1px)',
            boxShadow: `0 8px 20px ${alpha(gold, 0.3)}`,
          },
          '&:active': {
            transform: 'translateY(0)',
            boxShadow: `0 2px 8px ${alpha(gold, 0.25)}`,
          },
        },
        outlined: {
          borderColor: borderColor,
          '&:hover': {
            backgroundColor: alpha(gold, 0.08),
            borderColor: gold,
            transform: 'translateY(-1px)',
          },
          '&:active': { transform: 'translateY(0)' },
        },
        text: {
          '&:hover': { backgroundColor: alpha(gold, 0.08) },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: 'background-color 150ms ease, transform 150ms ease',
          '&:hover': { backgroundColor: alpha(gold, 0.1), transform: 'scale(1.08)' },
          '&:active': { transform: 'scale(0.94)' },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 6, fontWeight: 600 },
      },
    },
    MuiTextField: {
      defaultProps: { variant: 'outlined' },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          transition: 'border-color 150ms ease',
          '& fieldset': { borderColor: borderColor },
          '&:hover fieldset': { borderColor: alpha(gold, 0.6) },
        },
      },
    },
  },
});
