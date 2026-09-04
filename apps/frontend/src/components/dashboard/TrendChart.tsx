
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
import type { GameRecordView } from '../../lib/types';

interface TrendChartProps {
  games: GameRecordView[];
}

export function TrendChart({ games }: TrendChartProps) {
  if (!games || games.length === 0) {
    return (
      <div className="arcade-panel" style={{ width: '100%', height: '300px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <p style={{ color: '#888', fontSize: '12px' }}>NO DATA AVAILABLE FOR TRENDS</p>
      </div>
    );
  }

  // Reverse the games array to show chronological order (oldest to newest)
  // Take only the last 30 games to keep the chart readable
  const chartData = [...games].reverse().slice(-30).map((g, index) => ({
    name: `M${index + 1}`,
    apm: g.apm,
    pps: g.pps * 10, // Scale PPS up by 10 for better visualization on the same axis as APM
    result: g.result
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ backgroundColor: '#222', border: '2px solid #444', padding: '10px', fontFamily: "'Press Start 2P', monospace", fontSize: '10px' }}>
          <p style={{ color: '#fff', marginBottom: '5px' }}>Match: {label}</p>
          <p style={{ color: '#00f5ff' }}>APM: {payload[0].value.toFixed(2)}</p>
          <p style={{ color: '#ff00ff' }}>PPS: {(payload[1].value / 10).toFixed(2)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="arcade-panel" style={{ width: '100%', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <h2 style={{ fontSize: '14px', color: '#f1c40f', marginBottom: '20px', textShadow: '2px 2px 0px rgba(0,0,0,0.5)' }}>
        PERFORMANCE TREND (APM / PPS)
      </h2>
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 20, left: -20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="name" stroke="#888" tick={{ fontSize: 10, fill: '#888' }} />
            <YAxis stroke="#888" tick={{ fontSize: 10, fill: '#888' }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
            <Line 
              type="monotone" 
              name="APM"
              dataKey="apm" 
              stroke="#00f5ff" 
              strokeWidth={3}
              activeDot={{ r: 6, fill: '#00f5ff' }} 
            />
            <Line 
              type="monotone" 
              name="PPS (*10)"
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
