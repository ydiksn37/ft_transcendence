import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useConfig } from '../hooks/useConfig';
import './LobbyPage.css';

interface ApiKey {
  id: string;
  label: string;
  keyPrefix: string;
  isActive: boolean;
  createdAt: string;
}

export default function Settings() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const mode = new URLSearchParams(location.search).get('mode');
  const { keyConfig } = useConfig();

  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0); // 0: PROFILE

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // inputにフォーカスがある時はエンターキーの奪取を防ぐ
      if (document.activeElement?.tagName === 'INPUT') return;

      if (e.code === keyConfig.quitToMenu) {
        navigate(mode ? `/profile?mode=${mode}` : '/profile');
      }

      if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'ArrowLeft' || e.code === 'KeyA') {
        setSelectedIndex(0); // 戻るボタンをハイライト
      }

      if (e.code === 'Enter') {
        if (selectedIndex === 0) {
          navigate(mode ? `/profile?mode=${mode}` : '/profile');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, keyConfig.quitToMenu, mode, selectedIndex]);

  const fetchApiKeys = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/keys', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setApiKeys(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const handleCreateApiKey = async () => {
    if (!newKeyLabel.trim()) return;
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ label: newKeyLabel })
      });
      if (res.ok) {
        const data = await res.json();
        setNewKey(data.key);
        setNewKeyLabel('');
        fetchApiKeys();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeKey = async (id: string) => {
    if (!window.confirm('Are you sure you want to revoke this API key?')) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/keys/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchApiKeys();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleImportData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const json = JSON.parse(event.target?.result as string);
          if (!json.settings) {
            alert('Invalid JSON format. Expected "settings" object.');
            return;
          }
          const token = localStorage.getItem('token');
          const res = await fetch('/api/users/me/export/import', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ settings: json.settings })
          });
          if (res.ok) {
            alert('Settings successfully imported!');
          } else {
            alert('Failed to import settings.');
          }
        } catch (err) {
          alert('Invalid JSON file.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleExportData = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/users/me/export/download', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'my_data.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        alert('Failed to export data.');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to export data.');
    }
  };

  const handleDeleteAccount = async () => {
    const confirmMessage = "DANGER: Are you absolutely sure you want to delete your account?\nThis action cannot be undone.";
    if (!window.confirm(confirmMessage)) return;
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/users/me', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        alert('Account successfully deleted.');
        logout();
        navigate('/');
      } else {
        alert('Failed to delete account.');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to delete account.');
    }
  };

  // Common retro styles
  const buttonStyle = {
    padding: '8px 16px',
    fontSize: '14px',
    fontFamily: "'Press Start 2P', monospace",
    color: 'white',
    border: '4px solid white',
    cursor: 'pointer',
    boxShadow: '4px 4px 0px #333'
  };

  const panelStyle = {
    backgroundColor: '#222',
    border: '4px solid #555',
    padding: '20px',
    marginBottom: '20px',
    boxShadow: '8px 8px 0px #000',
    boxSizing: 'border-box' as const
  };

  return (
    <div className="settings-container" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '20px', backgroundColor: '#111', color: 'white',
      fontFamily: "'Press Start 2P', monospace", minHeight: '100vh', width: '100%', boxSizing: 'border-box',
      overflowX: 'hidden',
      overflowY: 'auto'
    }}>
      <div className="settings-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: '900px', marginBottom: '40px', position: 'relative', zIndex: 10 }}>
        <button 
          className={`back-btn ${selectedIndex === 0 ? 'selected' : ''}`}
          onClick={() => navigate(mode ? `/profile?mode=${mode}` : '/profile')}
          onMouseEnter={() => setSelectedIndex(0)}
          onMouseLeave={() => setSelectedIndex(-1)}
          style={selectedIndex === 0 ? { backgroundColor: '#555' } : {}}
        >
          ◀ PROFILE
        </button>
        <h1 className="settings-title" style={{ fontSize: '32px', margin: 0, textShadow: '4px 4px 0px #555', letterSpacing: '2px', color: '#fff' }}>SETTINGS</h1>
        <div className="settings-header-spacer" style={{ width: '150px' }}></div> {/* Spacer to balance the header */}
      </div>

      <div style={{ width: '100%', maxWidth: '900px' }}>
        
        {/* PUBLIC API KEYS SECTION */}
        <div style={panelStyle}>
          <h2 style={{ fontSize: '16px', color: '#3498db', marginBottom: '20px', borderBottom: '2px solid #444', paddingBottom: '10px' }}>PUBLIC API KEYS</h2>
          
          <div className="api-key-form" style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <input 
              type="text" 
              placeholder="KEY LABEL" 
              value={newKeyLabel}
              onChange={(e) => setNewKeyLabel(e.target.value)}
              style={{
                flex: 1,
                padding: '10px',
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '12px',
                backgroundColor: '#000',
                color: '#0f0',
                border: '2px solid #555',
                outline: 'none'
              }}
            />
            <button 
              onClick={handleCreateApiKey}
              disabled={loading || !newKeyLabel.trim()}
              style={{ ...buttonStyle, backgroundColor: '#4caf50' }}
            >
              CREATE
            </button>
          </div>

          {newKey && (
            <div style={{ backgroundColor: '#000', border: '2px dashed #f1c40f', padding: '15px', marginBottom: '20px' }}>
              <div style={{ color: '#f1c40f', fontSize: '10px', marginBottom: '10px', lineHeight: '1.5' }}>
                WARNING: Copy your new API key now. It will not be shown again!
              </div>
              <div style={{ color: '#fff', fontSize: '14px', wordBreak: 'break-all', userSelect: 'all' }}>
                {newKey}
              </div>
              <button 
                onClick={() => setNewKey(null)}
                style={{ ...buttonStyle, backgroundColor: '#333', marginTop: '10px', fontSize: '10px', padding: '8px 12px' }}
              >
                I COPIED IT
              </button>
            </div>
          )}

          <div>
            {apiKeys.length === 0 ? (
              <div style={{ fontSize: '10px', color: '#888' }}>NO API KEYS GENERATED.</div>
            ) : (
              <table style={{ width: '100%', fontSize: '10px', textAlign: 'left', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #444', color: '#888' }}>
                    <th style={{ padding: '10px 0' }}>LABEL</th>
                    <th style={{ padding: '10px 0' }}>PREFIX</th>
                    <th style={{ padding: '10px 0' }}>STATUS</th>
                    <th style={{ padding: '10px 0' }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {apiKeys.map((key) => (
                    <tr key={key.id} style={{ borderBottom: '1px solid #333' }}>
                      <td style={{ padding: '10px 0', color: '#fff' }}>{key.label}</td>
                      <td style={{ padding: '10px 0', color: '#0f0' }}>{key.keyPrefix}****</td>
                      <td style={{ padding: '10px 0', color: key.isActive ? '#4caf50' : '#e74c3c' }}>
                        {key.isActive ? 'ACTIVE' : 'REVOKED'}
                      </td>
                      <td style={{ padding: '10px 0' }}>
                        {key.isActive && (
                          <button 
                            onClick={() => handleRevokeKey(key.id)}
                            style={{ ...buttonStyle, backgroundColor: '#e74c3c', fontSize: '8px', padding: '6px 10px', border: '2px solid white', boxShadow: '2px 2px 0px #000' }}
                          >
                            REVOKE
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* GDPR PRIVACY SECTION */}
        <div style={panelStyle}>
          <h2 style={{ fontSize: '16px', color: '#9b59b6', marginBottom: '20px', borderBottom: '2px solid #444', paddingBottom: '10px' }}>PRIVACY & DATA (GDPR)</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            <div className="gdpr-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="gdpr-text" style={{ fontSize: '10px', color: '#ccc', lineHeight: '1.6', maxWidth: '60%' }}>
                <span style={{ color: '#fff' }}>EXPORT YOUR DATA</span><br/><br/>
                Download all your personal data, game history, and statistics in JSON format.
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  onClick={handleImportData} 
                  style={{ ...buttonStyle, backgroundColor: '#f39c12' }}
                >
                  IMPORT SETTINGS
                </button>
                <button 
                  onClick={handleExportData} 
                  style={{ ...buttonStyle, backgroundColor: '#3498db' }}
                >
                  EXPORT JSON
                </button>
              </div>
            </div>

            <div className="gdpr-row" style={{ borderTop: '2px solid #444', paddingTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="gdpr-text" style={{ fontSize: '10px', color: '#ccc', lineHeight: '1.6', maxWidth: '60%' }}>
                <span style={{ color: '#e74c3c' }}>DANGER ZONE: DELETE ACCOUNT</span><br/><br/>
                Permanently delete your account. This action cannot be undone.
              </div>
              <button 
                onClick={handleDeleteAccount}
                style={{ ...buttonStyle, backgroundColor: '#e74c3c' }}
              >
                DELETE ACCOUNT
              </button>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
