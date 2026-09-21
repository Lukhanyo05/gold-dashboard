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
          color: '#8B949E',
        }}
      >
        No closed trades yet. Add and close a trade to see your equity curve.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data}>
        <CartesianGrid stroke="#21262D" strokeDasharray="3 3" />
        <XAxis dataKey="label" stroke="#8B949E" fontSize={12} />
        <YAxis stroke="#8B949E" fontSize={12} domain={['auto', 'auto']} />
        <Tooltip
          contentStyle={{
            background: '#161B22',
            border: '1px solid #21262D',
            borderRadius: 8,
          }}
          formatter={(value) => {
            const num = typeof value === 'number' ? value : Number(value);
            return [`$${num.toFixed(2)}`, 'Balance'];
          }}
        />
        <Line
          type="monotone"
          dataKey="balance"
          stroke="#D4AF37"
          strokeWidth={2.5}
          dot={{ fill: '#D4AF37', r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}