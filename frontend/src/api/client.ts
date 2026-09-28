import axios from 'axios';

// VITE_API_URL is baked in at build time (see frontend/Dockerfile's ARG, or
// the env var set on whatever static host builds this) — falls back to the
// local dev backend when it isn't set.
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
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
  maxDailyLossPct?: number | null;
  maxWeeklyLossPct?: number | null;
}

export type TradeSymbol = 'GOLD' | 'ETHUSD';

export interface Trade {
  _id: string;
  tradeNumber: number;
  date: string;
  symbol: TradeSymbol;
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
  tags?: string[];
  setup?: string | null;
  followedPlan?: boolean | null;
  mistakes?: string[];
  screenshot?: string | null;
}

export interface Playbook {
  _id: string;
  name: string;
  description?: string;
  rules: string[];
  color?: string;
}

export interface PlaybookAdherence {
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  netPnL: number;
  adherenceRate: number | null;
}

export interface DayPnL {
  date: string;
  netPnL: number;
  trades: number;
  wins: number;
  losses: number;
}

export interface GroupStat {
  key: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  netPnL: number;
}

export interface CoreStats {
  totalTrades: number;
  closedTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number | null;
  profitFactor: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  avgRMultiple: number | null;
  totalPnL: number;
  currentStreak: { type: 'Win' | 'Loss' | null; count: number };
  bestDay: DayPnL | null;
  worstDay: DayPnL | null;
}

export interface EquityPoint {
  date: string;
  balance: number;
}

export interface DisciplineStats {
  trackedTrades: number;
  followedCount: number;
  brokeRuleCount: number;
  adherenceRate: number | null;
}

export interface AnalyticsSummary {
  core: CoreStats;
  equityCurve: EquityPoint[];
  bySymbol: GroupStat[];
  byWeekday: GroupStat[];
  byTag: GroupStat[];
  bySetup: GroupStat[];
  discipline: DisciplineStats;
}

export type WithdrawalAllocation = 'Reinvested' | 'Saved' | 'Other';

export interface Withdrawal {
  _id: string;
  date: string;
  amount: number;
  type: 'Withdrawal' | 'Deposit';
  taxReserve: number;
  notes?: string;
  allocation?: WithdrawalAllocation | null;
}

export type GoalType = 'Balance' | 'WinRate' | 'ProfitFactor' | 'Custom';

export interface Goal {
  _id: string;
  label: string;
  type: GoalType;
  targetValue: number;
  startValue: number;
  targetDate?: string | null;
  achieved: boolean;
  achievedAt?: string | null;
  currentValue: number | null;
  progressPct: number | null;
  reachedNow: boolean;
}

export interface BehavioralInsights {
  winRateAfterLoss: number | null;
  winRateAfterWin: number | null;
  tradesAfterLoss: number;
  tradesAfterWin: number;
  byTradesThatDay: { tradesSoFar: string; count: number; winRate: number | null }[];
}

export interface WeeklyRecap {
  weekStart: string;
  weekEnd: string;
  netPnL: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  bestDay: DayPnL | null;
  worstDay: DayPnL | null;
  adherenceRate: number | null;
}

export interface AnalyticsInsights {
  behavioral: BehavioralInsights;
  lastWeek: WeeklyRecap;
}

export interface RiskStatus {
  dailyLimitPct: number | null;
  weeklyLimitPct: number | null;
  todayPnL: number;
  weekPnL: number;
  dailyLimitUSD: number | null;
  weeklyLimitUSD: number | null;
  dailyBreached: boolean;
  weeklyBreached: boolean;
}

export interface YesterdayRecap {
  date: string | null;
  trades: number;
  netPnL: number;
  wins: number;
  losses: number;
  winRate: number | null;
  adherenceRate: number | null;
}

export interface MentorMessage {
  id: string;
  severity: 'success' | 'info' | 'warning' | 'danger';
  title: string;
  message: string;
}

export interface RiskMentorReport {
  yesterday: YesterdayRecap;
  todayTrades: number;
  currentStreak: { type: 'Win' | 'Loss' | null; count: number };
  peakBalance: number | null;
  currentBalance: number;
  drawdownFromPeakPct: number | null;
  riskPerTradePct: number;
  recentAdherenceRate: number | null;
  messages: MentorMessage[];
}

export interface NewsItem {
  title: string;
  link: string;
  pubDate: string | null;
  source: string;
}

export interface MacroEvent {
  date: string;
  label: string;
  category: 'FOMC' | 'NFP';
  note: string;
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
export const getTrades = (symbol?: TradeSymbol | 'All') =>
  api
    .get<Trade[]>('/trades', {
      params: symbol && symbol !== 'All' ? { symbol } : undefined,
    })
    .then((r) => r.data);

export const createTrade = (data: Partial<Trade>) =>
  api.post<Trade>('/trades', data).then((r) => r.data);

export const deleteTrade = (id: string) =>
  api.delete(`/trades/${id}`).then((r) => r.data);

export const getTradeTags = () =>
  api.get<string[]>('/trades/meta/tags').then((r) => r.data);

// ---------- Playbooks ----------
export const getPlaybooks = () =>
  api.get<Playbook[]>('/playbooks').then((r) => r.data);

export const createPlaybook = (data: Partial<Playbook>) =>
  api.post<Playbook>('/playbooks', data).then((r) => r.data);

export const updatePlaybook = (id: string, data: Partial<Playbook>) =>
  api.patch<Playbook>(`/playbooks/${id}`, data).then((r) => r.data);

export const deletePlaybook = (id: string) =>
  api.delete(`/playbooks/${id}`).then((r) => r.data);

export const getPlaybookAdherence = (id: string) =>
  api.get<PlaybookAdherence>(`/playbooks/${id}/adherence`).then((r) => r.data);

// ---------- Analytics ----------
export const getAnalyticsSummary = (symbol?: TradeSymbol | 'All') =>
  api
    .get<AnalyticsSummary>('/analytics/summary', {
      params: symbol && symbol !== 'All' ? { symbol } : undefined,
    })
    .then((r) => r.data);

export const getCalendarPnL = (month?: string) =>
  api
    .get<DayPnL[]>('/analytics/calendar', { params: month ? { month } : undefined })
    .then((r) => r.data);

export const getRollingStats = (days: number, symbol?: TradeSymbol | 'All') =>
  api
    .get<CoreStats>('/analytics/rolling', {
      params: { days, ...(symbol && symbol !== 'All' ? { symbol } : {}) },
    })
    .then((r) => r.data);

export const getAnalyticsInsights = () =>
  api.get<AnalyticsInsights>('/analytics/insights').then((r) => r.data);

// ---------- Daily Journal (notes + mood, one per calendar day) ----------
export interface DailyJournalEntry {
  date: string; // YYYY-MM-DD
  mood: number | null; // 1-5
  note: string;
}

export interface MoodPnLBucket {
  mood: number;
  days: number;
  avgNetPnL: number;
  positiveDayRate: number | null;
}

export const getDailyJournalMonth = (month: string) =>
  api.get<DailyJournalEntry[]>('/daily-journal', { params: { month } }).then((r) => r.data);

export const getDailyJournalEntry = (date: string) =>
  api.get<DailyJournalEntry>(`/daily-journal/${date}`).then((r) => r.data);

export const saveDailyJournalEntry = (date: string, data: { mood: number | null; note: string }) =>
  api.put<DailyJournalEntry>(`/daily-journal/${date}`, data).then((r) => r.data);

export const deleteDailyJournalEntry = (date: string) =>
  api.delete(`/daily-journal/${date}`).then((r) => r.data);

export const getMoodCorrelation = () =>
  api.get<MoodPnLBucket[]>('/daily-journal/mood-correlation').then((r) => r.data);

export const getRiskStatus = () =>
  api.get<RiskStatus>('/analytics/risk-status').then((r) => r.data);

export const getRiskMentor = () =>
  api.get<RiskMentorReport>('/analytics/mentor').then((r) => r.data);

// ---------- Goals ----------
export const getGoals = () => api.get<Goal[]>('/goals').then((r) => r.data);

export const createGoal = (data: {
  label: string;
  type: GoalType;
  targetValue: number;
  targetDate?: string | null;
}) => api.post<Goal>('/goals', data).then((r) => r.data);

export const updateGoal = (id: string, data: Partial<Pick<Goal, 'label' | 'targetValue' | 'targetDate' | 'achieved'>>) =>
  api.patch<Goal>(`/goals/${id}`, data).then((r) => r.data);

export const deleteGoal = (id: string) =>
  api.delete(`/goals/${id}`).then((r) => r.data);

// ---------- News & Events (public, no auth) ----------
export const getGoldNews = () =>
  api.get<{ items: NewsItem[] }>('/news/gold').then((r) => r.data.items);

export const getMacroEvents = (months = 3) =>
  api.get<{ events: MacroEvent[] }>('/events', { params: { months } }).then((r) => r.data.events);

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

export type SentimentLabel = 'Bullish' | 'Bearish' | 'Neutral';

export interface Sentiment {
  changePercent: number;
  label: SentimentLabel;
  windowMinutes: number;
}

export interface GoldPrice {
  price: number;
  source: 'paxg' | 'cache';
  updatedAt: string;
  sentiment?: Sentiment | null;
}

export interface EthPrice {
  price: number;
  source: 'ethusdt' | 'cache';
  updatedAt: string;
  sentiment?: Sentiment | null;
}

export const getGoldPrice = () =>
  api.get<GoldPrice>('/price/gold').then((r) => r.data);

export const getEthPrice = () =>
  api.get<EthPrice>('/price/eth').then((r) => r.data);

export const updateTrade = (id: string, data: Partial<Trade>) =>
  api.patch<Trade>(`/trades/${id}`, data).then((r) => r.data);

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
  duplicates?: number;
  parseErrors: string[];
  newBalance: number;
}

export async function importTradesFile(
  file: File,
  since?: string
): Promise<ImportResult> {
  const fd = new FormData();
  fd.append('file', file);
  if (since) fd.append('since', since);
  const { data } = await api.post<ImportResult>('/trades/import', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}