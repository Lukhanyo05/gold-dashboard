import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { theme } from './theme';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Journal } from './pages/Journal';
import { Calculator } from './pages/Calculator';
import { Withdrawals } from './pages/Withdrawals';
import { TaxCenter } from './pages/TaxCenter';
import { Projection } from './pages/Projection';

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Layout>
                  <Routes>
                    <Route path="/"            element={<Dashboard />} />
                    <Route path="/journal"     element={<Journal />} />
                    <Route path="/calculator"  element={<Calculator />} />
                    <Route path="/withdrawals" element={<Withdrawals />} />
                    <Route path="/tax"         element={<TaxCenter />} />
                    <Route path="/projection"  element={<Projection />} />
                    <Route path="*"            element={<Navigate to="/" replace />} />
                  </Routes>
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;