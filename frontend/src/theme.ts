import { createTheme, alpha } from '@mui/material/styles';

// A private ledger, not a dev-tool dashboard: warm cream/parchment tones
// instead of a stark white admin panel, with an antique (not neon) gold
// as the single accent — this app's own stated identity (🥇 Gold Trading
// Company), not a generic palette pick.
const gold = '#9C7A2E';       // deeper antique gold — enough contrast for text/icons on a light ground
const goldFill = '#C9A24B';   // lighter gold, used where it sits as a filled swatch (e.g. button backgrounds)
const goldLight = '#E4CE94';
const bgVoid = '#FAF5E9';     // warm parchment
const bgPanel = '#FFFFFF';
const borderColor = '#E6D9BC';
const textPrimary = '#2B2013';
const textSecondary = '#6E5F45';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: gold, dark: '#7A5E20', light: goldLight },
    secondary: { main: '#3B6E96' },
    success: { main: '#2E7D32' },
    error: { main: '#C62828' },
    warning: { main: '#9C6B16' },
    info: { main: '#3B6E96' },
    background: {
      default: bgVoid,
      paper: bgPanel,
    },
    text: {
      primary: textPrimary,
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
            `radial-gradient(ellipse 1100px 760px at 12% -8%, ${alpha(goldFill, 0.10)}, transparent 60%), ` +
            `radial-gradient(ellipse 900px 680px at 105% 0%, ${alpha('#3B6E96', 0.05)}, transparent 55%)`,
          backgroundAttachment: 'fixed',
          backgroundRepeat: 'no-repeat',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: bgPanel,
          backgroundImage: 'none',
          border: `1px solid ${borderColor}`,
          borderRadius: 14,
          boxShadow: '0 1px 2px rgba(43,32,19,0.04), 0 2px 10px rgba(43,32,19,0.04)',
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
            boxShadow: `0 8px 20px ${alpha(gold, 0.28)}`,
          },
          '&:active': {
            transform: 'translateY(0)',
            boxShadow: `0 2px 8px ${alpha(gold, 0.22)}`,
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
