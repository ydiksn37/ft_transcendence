import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './JoinPage.css';

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'Enter') {
        navigate('/');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  return (
    <div className="join-page-container" style={{ padding: '40px', overflowY: 'auto', display: 'block', backgroundColor: '#111' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto', backgroundColor: 'rgba(0,0,0,0.8)', padding: '40px', border: '4px solid #fff', fontFamily: 'sans-serif', color: '#fff', lineHeight: '1.6' }}>
        <h1 style={{ fontFamily: '"Press Start 2P", monospace', fontSize: '24px', marginBottom: '30px', textAlign: 'center' }}>PRIVACY POLICY</h1>
        <p style={{ marginBottom: '20px' }}>Last updated: {new Date().toLocaleDateString('en-US')}</p>
        
        <h2 style={{ color: '#4caf50', marginTop: '30px' }}>1. Introduction</h2>
        <p>Welcome to Project T. We respect your privacy and are committed to protecting your personal data. This privacy policy will inform you as to how we look after your personal data when you visit our website and tell you about your privacy rights and how the law protects you.</p>

        <h2 style={{ color: '#4caf50', marginTop: '30px' }}>2. Data We Collect</h2>
        <p>We may collect, use, store and transfer different kinds of personal data about you which we have grouped together as follows:</p>
        <ul style={{ marginLeft: '20px', marginTop: '10px' }}>
          <li><strong>Identity Data:</strong> username, display name.</li>
          <li><strong>Contact Data:</strong> email address.</li>
          <li><strong>Game Data:</strong> match history, APM, PPS, win/loss records, tournament participation.</li>
          <li><strong>Technical Data:</strong> internet protocol (IP) address, browser type and version, time zone setting and location.</li>
        </ul>

        <h2 style={{ color: '#4caf50', marginTop: '30px' }}>3. How We Use Your Data</h2>
        <p>We will only use your personal data when the law allows us to. Most commonly, we will use your personal data in the following circumstances:</p>
        <ul style={{ marginLeft: '20px', marginTop: '10px' }}>
          <li>To provide and maintain our Service, including to monitor the usage of our Service.</li>
          <li>To manage your Account: to manage your registration as a user of the Service.</li>
          <li>For the performance of a contract: the development, compliance and undertaking of the game rules and tournaments.</li>
          <li>To provide you with news, special offers and general information about other goods, services and events which we offer.</li>
        </ul>

        <h2 style={{ color: '#4caf50', marginTop: '30px' }}>4. Data Security</h2>
        <p>We have put in place appropriate security measures to prevent your personal data from being accidentally lost, used or accessed in an unauthorised way, altered or disclosed. In addition, we limit access to your personal data to those employees, agents, contractors and other third parties who have a business need to know.</p>

        <h2 style={{ color: '#4caf50', marginTop: '30px' }}>5. GDPR and Data Rights</h2>
        <p>If you are a resident of the European Economic Area (EEA), you have certain data protection rights. You have the right to access, update or to delete the information we have on you. You can do this directly within your account settings section, or by contacting us.</p>
        <p>Account deletion requires your current password for a local account, your current TOTP code when 2FA is enabled, and an explicit confirmation phrase. Deletion permanently removes your profile, credentials, settings, social relationships, messages, API keys, statistics, achievements, solo records, and uploaded files. Match and tournament results are retained only as anonymized records with your account identifier removed. This cannot be undone.</p>
        
        <div style={{ marginTop: '50px', textAlign: 'center' }}>
          <button 
            onClick={() => navigate('/')}
            style={{ 
              fontFamily: '"Press Start 2P", monospace', 
              padding: '15px 30px', 
              backgroundColor: '#000', 
              color: '#fff', 
              border: '4px solid #3498db', 
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            RETURN (ESC)
          </button>
        </div>
      </div>
    </div>
  );
}
