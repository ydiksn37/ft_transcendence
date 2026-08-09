import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

type MenuProps = {
  startGame: (mode: 'MARATHON' | '40_LINES' | '4_WIDE' | 'ONLINE_1V1') => void;
  joinOnline: () => void;
  setAppState: (state: 'CONFIG' | 'RECORDS') => void;
};

export const Menu: React.FC<MenuProps> = ({ startGame, joinOnline, setAppState }) => {
  const navigate = useNavigate();
  const { token, user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-[#333] font-sans w-full absolute top-0 left-0">
      {/* Navbar */}
      <nav className="bg-[#2c3e50] px-4 py-3 flex justify-between items-center border-b-4 border-[#1a252f] shadow-sm">
        <div className="text-xl font-bold text-white tracking-wider">PixiJS Tetris</div>
        <div className="flex gap-4">
          <button onClick={() => navigate('/')} className="text-white hover:text-gray-300 text-sm font-bold">Home</button>
          {token && <button onClick={() => navigate('/dashboard')} className="text-white hover:text-gray-300 text-sm font-bold">Dashboard</button>}
        </div>
      </nav>

      {/* Main Container */}
      <div className="max-w-5xl mx-auto mt-6 flex flex-col md:flex-row gap-6 px-4">
        
        {/* Left Column (Main Content) */}
        <div className="flex-1">
          {/* Welcome / Info Panel */}
          <div className="bg-white border border-[#ccc] p-5 mb-6 shadow-sm">
            <h2 className="text-lg font-bold border-b border-[#ddd] pb-2 mb-3 text-[#2c3e50]">PixiJS Tetris へようこそ</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              PixiJS Tetris は、ブラウザで動作する対戦対応のテトリスプラットフォームです。<br/>
              エンドレスにブロックを消し続ける「Marathon」や、最速で40ラインを消す「40 Lines」、そして他のプレイヤーと対戦できる「Online 1v1」などのモードが用意されています。
            </p>
          </div>

          {/* Active Contests / Game Modes Table */}
          <h3 className="text-md font-bold border-b-2 border-[#2c3e50] pb-1 mb-3 text-[#2c3e50]">ゲームモード一覧 (Active Modes)</h3>
          <table className="w-full border-collapse border border-[#ccc] bg-white shadow-sm text-sm">
            <thead className="bg-[#e9ecef] border-b border-[#ccc]">
              <tr>
                <th className="border-r border-[#ccc] px-3 py-2 text-left font-bold text-gray-700">モード名 (Mode)</th>
                <th className="border-r border-[#ccc] px-3 py-2 text-left font-bold text-gray-700">説明 (Description)</th>
                <th className="px-3 py-2 text-center font-bold text-gray-700 w-24">参加 (Play)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#eee] hover:bg-[#f8f9fa]">
                <td className="border-r border-[#ccc] px-3 py-3 font-bold text-[#2980b9]">Marathon</td>
                <td className="border-r border-[#ccc] px-3 py-3 text-gray-600">エンドレスでブロックを消し続け、ハイスコアを目指す基本モード。</td>
                <td className="px-3 py-3 text-center">
                  <button onClick={() => startGame('MARATHON')} className="text-xs bg-[#fff] border border-[#999] hover:bg-[#e0e0e0] text-[#333] px-3 py-1 font-bold shadow-sm">参加</button>
                </td>
              </tr>
              <tr className="border-b border-[#eee] hover:bg-[#f8f9fa]">
                <td className="border-r border-[#ccc] px-3 py-3 font-bold text-[#e67e22]">40 Lines</td>
                <td className="border-r border-[#ccc] px-3 py-3 text-gray-600">40ラインを消すまでのタイムを競う、スプリントモード。</td>
                <td className="px-3 py-3 text-center">
                  <button onClick={() => startGame('40_LINES')} className="text-xs bg-[#fff] border border-[#999] hover:bg-[#e0e0e0] text-[#333] px-3 py-1 font-bold shadow-sm">参加</button>
                </td>
              </tr>
              <tr className="border-b border-[#eee] hover:bg-[#f8f9fa]">
                <td className="border-r border-[#ccc] px-3 py-3 font-bold text-[#8e44ad]">4-Wide</td>
                <td className="border-r border-[#ccc] px-3 py-3 text-gray-600">4列空けのコンボ練習に特化したモード。</td>
                <td className="px-3 py-3 text-center">
                  <button onClick={() => startGame('4_WIDE')} className="text-xs bg-[#fff] border border-[#999] hover:bg-[#e0e0e0] text-[#333] px-3 py-1 font-bold shadow-sm">参加</button>
                </td>
              </tr>
              <tr className="hover:bg-[#f8f9fa]">
                <td className="border-r border-[#ccc] px-3 py-3 font-bold text-[#c0392b]">Online 1v1</td>
                <td className="border-r border-[#ccc] px-3 py-3 text-gray-600">オンラインで他のプレイヤーとリアルタイム対戦を行うモード。</td>
                <td className="px-3 py-3 text-center">
                  <button onClick={joinOnline} className="text-xs bg-[#fff] border border-[#999] hover:bg-[#e0e0e0] text-[#333] px-3 py-1 font-bold shadow-sm">参加</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Right Column (Sidebar) */}
        <div className="w-full md:w-64 flex flex-col gap-4">
          
          {/* User Profile Panel */}
          <div className="bg-white border border-[#ccc] shadow-sm">
            <h3 className="bg-[#e9ecef] border-b border-[#ccc] px-3 py-2 font-bold text-sm text-[#2c3e50]">My Profile</h3>
            <div className="p-3 text-sm">
              {token && user ? (
                <div>
                  <div className="font-bold text-[#333] mb-2">{user.username}</div>
                  <div className="flex flex-col gap-2 mt-3">
                    <button onClick={() => navigate('/dashboard')} className="text-left text-[#2980b9] hover:underline hover:text-[#1a5276]">My Dashboard</button>
                    <button onClick={() => { logout(); navigate('/'); }} className="text-left text-gray-500 hover:underline">ログアウト</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-gray-600 mb-2">ログインしていません。</p>
                  <button onClick={() => navigate('/login')} className="w-full text-center bg-[#fff] border border-[#999] hover:bg-[#e0e0e0] text-[#333] px-3 py-1 text-xs font-bold shadow-sm">
                    ログイン / 新規登録
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Settings & Info Panel */}
          <div className="bg-white border border-[#ccc] shadow-sm">
            <h3 className="bg-[#e9ecef] border-b border-[#ccc] px-3 py-2 font-bold text-sm text-[#2c3e50]">Information</h3>
            <div className="p-3 text-sm">
              <ul className="list-disc pl-4 space-y-2 text-[#2980b9]">
                <li><button onClick={() => setAppState('CONFIG')} className="hover:underline hover:text-[#1a5276]">ゲーム設定 (Config)</button></li>
                <li><button onClick={() => setAppState('RECORDS')} className="hover:underline hover:text-[#1a5276]">ローカル記録 (Records)</button></li>
              </ul>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
