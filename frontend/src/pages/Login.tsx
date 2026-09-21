import { useState } from 'react';
import {
  Box, Paper, Typography, TextField, Button, Alert, Tabs, Tab,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { login, register } from '../api/client';

export function Login() {
  const [tab, setTab] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = tab === 0
        ? await login(email, password)
        : await register(email, password, name);
      localStorage.setItem('token', res.token);
      localStorage.setItem('user', JSON.stringify(res.user));
      navigate('/');
    } catch (e) {
      const err = e as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      setError(err?.response?.data?.error ?? err?.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Paper sx={{ p: 4, maxWidth: 420, width: '100%' }}>
        <Typography variant="h4" sx={{ mb: 1, color: 'primary.main' }}>
          🥇 Gold Trading Company
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {tab === 0 ? 'Sign in to your dashboard' : 'Create your account'}
        </Typography>

        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
          <Tab label="Login" />
          <Tab label="Register" />
        </Tabs>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {tab === 1 && (
          <TextField
            fullWidth
            label="Name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            sx={{ mb: 2 }}
          />
        )}

        <TextField
          fullWidth
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          sx={{ mb: 2 }}
        />

        <TextField
          fullWidth
          label="Password (min 8 chars)"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          sx={{ mb: 3 }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />

        <Button
          fullWidth
          variant="contained"
          size="large"
          onClick={submit}
          disabled={!email || !password || loading}
        >
          {loading ? 'Please wait...' : tab === 0 ? 'Login' : 'Create Account'}
        </Button>
      </Paper>
    </Box>
  );
}