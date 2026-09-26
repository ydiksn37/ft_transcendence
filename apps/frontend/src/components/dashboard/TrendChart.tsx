
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import type { DailyAnalyticView, GameRecordView } from '../../lib/types';

interface TrendChartProps {
  games: GameRecordView[];
  analytics?: DailyAnalyticView[];
}

export function TrendChart({ games, analytics = [] }: TrendChartProps) {
  if ((!games || games.length === 0) && analytics.length === 0) {
    return (
      <div className="arcade-panel" style={{ width: '100%', height: '300px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <p style={{ color: '#888', fontSize: '12px' }}>NO DATA AVAILABLE FOR TRENDS</p>
      </div>
    );
  }

  // Prefer the server's UTC daily aggregates. The history-derived fallback
  // keeps the chart useful for older servers and isolated component tests.
  const chartData = analytics.length > 0
    ? analytics.slice(-30).map(day => ({
        name: new Date(day.date).toISOString().slice(5, 10),
        apm: Number(day.avgApm),
        pps: Number(day.avgPps),
      }))
    : [...games].reverse().slice(-30).map((g, index) => ({
        name: `M${index + 1}`,
        apm: g.apm,
        pps: g.pps,
      }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ backgroundColor: '#222', border: '2px solid #444', padding: '10px', fontFamily: "'Press Start 2P', monospace", fontSize: '10px' }}>
          <p style={{ color: '#fff', marginBottom: '5px' }}>Match: {label}</p>
          {payload.map((entry: any) => (
            <p key={entry.dataKey} style={{ color: entry.color }}>
              {entry.name}: {Number(entry.value).toFixed(2)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="arcade-panel" style={{ width: '100%', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <h2 style={{ fontSize: '14px', color: '#f1c40f', marginBottom: '20px', textShadow: '2px 2px 0px rgba(0,0,0,0.5)' }}>
        PERFORMANCE TREND ({analytics.length > 0 ? 'UTC DAILY AVERAGES' : 'LATEST 30 MATCHES'})
      </h2>
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 20, left: -20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="name" stroke="#888" tick={{ fontSize: 10, fill: '#888' }} />
            <YAxis yAxisId="apm" stroke="#00f5ff" tick={{ fontSize: 10 }} />
            <YAxis yAxisId="pps" orientation="right" stroke="#ff00ff" tick={{ fontSize: 10 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
            <Line 
              type="monotone" 
              name="APM"
              yAxisId="apm"
              dataKey="apm" 
              stroke="#00f5ff" 
              strokeWidth={3}
              activeDot={{ r: 6, fill: '#00f5ff' }} 
            />
            <Line 
              type="monotone" 
              name="PPS"
              yAxisId="pps"
              dataKey="pps" 
              stroke="#ff00ff" 
              strokeWidth={3}
              activeDot={{ r: 6, fill: '#ff00ff' }} 
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
