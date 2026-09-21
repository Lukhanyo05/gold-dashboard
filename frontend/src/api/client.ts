import axios from 'axios';

export const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' },
});

// ---------- Interceptors ----------
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ---------- Types ----------
export interface Account {

  _id: string;
  startingBalance: number;
  currentBalance: number;
  targetBalance: number;
  riskPerTrade: number;
  withdrawalRate: number;
  taxRate: number;
  taxReserve: number;
  totalWithdrawn: number;
  totalDeposited: number;
}

export interface Trade {
  _id: string;
  tradeNumber: number;
  date: string;
  direction: 'Buy' | 'Sell';
  entry: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  closePrice?: number | null;
  lotSize: number;
  swapFee: number;
  balanceBefore: number;
  balanceAfter?: number;
  result: 'Win' | 'Loss' | 'Breakeven' | 'Manual' | 'Open';
  rMultiple?: number;
  notes?: string;
}

export interface Withdrawal {
  _id: string;
  date: string;
  amount: number;
  type: 'Withdrawal' | 'Deposit';
  taxReserve: number;
  notes?: string;
}

export interface LotSizingResult {
  lot: number;
  riskedUSD: number;
  dollarPerPoint: number;
  contractSize: number;
}

export interface ProjectionMonth {
  month: number;
  start: number;
  pnl: number;
  withdrawal: number;
  end: number;
}

export interface ProjectionResult {
  monthsToTarget: number | null;
  yearsToTarget: number | null;
  effectiveMonthlyRate: number;
  schedule: ProjectionMonth[];
  totalWithdrawn: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

// ---------- Account ----------
export const getAccount = () =>
  api.get<Account>('/account').then((r) => r.data);

export const updateAccount = (data: Partial<Account>) =>
  api.patch<Account>('/account', data).then((r) => r.data);

export const calcLotSize = (stopLossPoints: number, riskPercent?: number) =>
  api
    .post<LotSizingResult>('/account/lot-size', { stopLossPoints, riskPercent })
    .then((r) => r.data);

export const getTaxEstimate = (annualProfit: number) =>
  api
    .post<{ annualProfit: number; tax: number; effectiveRate: number }>(
      '/account/tax-estimate',
      { annualProfit }
    )
    .then((r) => r.data);

export const getProjection = (monthlyPnL: number) =>
  api
    .post<ProjectionResult>('/account/projection', { monthlyPnL })
    .then((r) => r.data);

// ---------- Trades ----------
export const getTrades = () =>
  api.get<Trade[]>('/trades').then((r) => r.data);

export const createTrade = (data: Partial<Trade>) =>
  api.post<Trade>('/trades', data).then((r) => r.data);

export const deleteTrade = (id: string) =>
  api.delete(`/trades/${id}`).then((r) => r.data);

// ---------- Withdrawals ----------
export const getWithdrawals = () =>
  api.get<Withdrawal[]>('/withdrawals').then((r) => r.data);

export const createWithdrawal = (data: Partial<Withdrawal>) =>
  api.post<Withdrawal>('/withdrawals', data).then((r) => r.data);

// ---------- Auth ----------
export const register = (email: string, password: string, name?: string) =>
  api
    .post<AuthResponse>('/auth/register', { email, password, name })
    .then((r) => r.data);

export const login = (email: string, password: string) =>
  api
    .post<AuthResponse>('/auth/login', { email, password })
    .then((r) => r.data);

export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};

export const getStoredUser = (): AuthUser | null => {
  const raw = localStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
};

export interface GoldPrice {
  price: number;
  source: 'paxg' | 'cache';
  updatedAt: string;
}

export const getGoldPrice = () =>
  api.get<GoldPrice>('/price/gold').then((r) => r.data);

export const updateTrade = (id: string, data: Partial<Trade>) =>
  api.patch<Trade>(`/trades/${id}`, data).then((r) => r.data);
export interface ImportResult {
  inserted: number;
  skipped: number;
  parseErrors: string[];
  newBalance: number;
}



export const exportTradesCSVUrl = () =>
  `${api.defaults.baseURL}/trades/export?token=${localStorage.getItem('token')}`;

export async function downloadTradesCSV(): Promise<void> {
  const res = await api.get('/trades/export', { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const a = document.createElement('a');
  a.href = url;
  a.download = `gold-trades-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

// ---------- CSV / Excel Import ----------
export interface ImportResult {
  inserted: number;
  skipped: number;
  parseErrors: string[];
  newBalance: number;
}

export async function importTradesFile(file: File): Promise<ImportResult> {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await api.post<ImportResult>('/trades/import', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}