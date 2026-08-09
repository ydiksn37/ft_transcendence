import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import type { SprintLeaderboardEntry } from '@transcendence/shared';

const formatTime = (ms: number) => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
};

export const SprintLeaderboard = () => {
  const [globalRecords, setGlobalRecords] = useState<SprintLeaderboardEntry[]>([]);
  const [personalRecords, setPersonalRecords] = useState<SprintLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'GLOBAL' | 'PERSONAL'>('GLOBAL');
  const { token } = useAuth();

  useEffect(() => {
    const fetchRecords = async () => {
      setLoading(true);
      try {
        const [globalRes, personalRes] = await Promise.all([
          fetch('http://localhost:3000/api/sprint/leaderboard'),
          token ? fetch('http://localhost:3000/api/sprint/me', {
            headers: { Authorization: `Bearer ${token}` }
          }) : Promise.resolve(null)
        ]);

        if (globalRes.ok) {
          setGlobalRecords(await globalRes.json());
        }
        if (personalRes && personalRes.ok) {
          setPersonalRecords(await personalRes.json());
        }
      } catch (err) {
        console.error('Failed to fetch sprint records', err);
      } finally {
        setLoading(false);
      }
    };

    fetchRecords();
  }, [token]);

  if (loading) return <div className="text-neon-blue">Loading Records...</div>;

  const recordsToDisplay = tab === 'GLOBAL' ? globalRecords : personalRecords;

  return (
    <div className="bg-gray-900 bg-opacity-80 p-6 rounded-lg border border-neon-blue w-full max-w-2xl text-white font-mono shadow-neon">
      <h2 className="text-2xl mb-6 text-center text-neon-pink text-glow">40 LINES LEADERBOARD</h2>
      
      <div className="flex justify-center gap-4 mb-6">
        <button
          className={`px-4 py-2 rounded transition-colors ${tab === 'GLOBAL' ? 'bg-neon-blue text-black font-bold shadow-neon' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
          onClick={() => setTab('GLOBAL')}
        >
          GLOBAL TOP 10
        </button>
        {token && (
          <button
            className={`px-4 py-2 rounded transition-colors ${tab === 'PERSONAL' ? 'bg-neon-blue text-black font-bold shadow-neon' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
            onClick={() => setTab('PERSONAL')}
          >
            MY RECORDS
          </button>
        )}
      </div>

      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-gray-700 text-gray-400 text-sm">
            <th className="py-2 px-4">RANK</th>
            {tab === 'GLOBAL' && <th className="py-2 px-4">PLAYER</th>}
            <th className="py-2 px-4 text-right">TIME</th>
            <th className="py-2 px-4 text-right">PPS</th>
            <th className="py-2 px-4 text-right">DATE</th>
          </tr>
        </thead>
        <tbody>
          {recordsToDisplay.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-8 text-center text-gray-500">
                No records found.
              </td>
            </tr>
          ) : (
            recordsToDisplay.map((entry) => {
              const pps = entry.record.pieces
                ? (entry.record.pieces / (entry.record.timeMs / 1000)).toFixed(2)
                : '-';
              const dateStr = new Date(entry.record.createdAt).toLocaleDateString();
              
              return (
                <tr key={entry.record.id} className="border-b border-gray-800 hover:bg-gray-800 transition-colors">
                  <td className={`py-3 px-4 font-bold ${entry.rank === 1 ? 'text-yellow-400 text-glow' : entry.rank === 2 ? 'text-gray-300' : entry.rank === 3 ? 'text-amber-600' : 'text-gray-500'}`}>
                    #{entry.rank}
                  </td>
                  {tab === 'GLOBAL' && (
                    <td className="py-3 px-4">
                      {entry.user?.username || 'Unknown'}
                    </td>
                  )}
                  <td className="py-3 px-4 text-right font-bold text-neon-blue text-glow-sm tabular-nums">
                    {formatTime(entry.record.timeMs)}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-400 tabular-nums">
                    {pps}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-500 text-sm">
                    {dateStr}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};
