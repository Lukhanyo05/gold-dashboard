import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import type { Trade } from '../api/client';

interface Props {
  trades: Trade[];
  startingBalance: number;
}

export function EquityChart({ trades, startingBalance }: Props) {
  const closed = trades
    .filter((t) => t.result !== 'Open' && t.balanceAfter != null)
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));

  const data = [
    { label: 'Start', balance: startingBalance },
    ...closed.map((t, i) => ({
      label: `#${i + 1}`,
      balance: t.balanceAfter!,
    })),
  ];

  if (data.length < 2) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: 'center',
          color: '#6E5F45',
        }}
      >
        No closed trades yet. Add and close a trade to see your equity curve.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data}>
        <CartesianGrid stroke="#E6D9BC" strokeDasharray="3 3" />
        <XAxis dataKey="label" stroke="#6E5F45" fontSize={12} />
        <YAxis stroke="#6E5F45" fontSize={12} domain={['auto', 'auto']} />
        <Tooltip
          contentStyle={{
            background: '#FFFFFF',
            border: '1px solid #E6D9BC',
            borderRadius: 8,
            color: '#2B2013',
          }}
          formatter={(value) => {
            const num = typeof value === 'number' ? value : Number(value);
            return [`$${num.toFixed(2)}`, 'Balance'];
          }}
        />
        <Line
          type="monotone"
          dataKey="balance"
          stroke="#9C7A2E"
          strokeWidth={2.5}
          dot={{ fill: '#9C7A2E', r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}