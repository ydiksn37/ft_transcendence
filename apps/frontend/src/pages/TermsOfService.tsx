import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './JoinPage.css';

export default function TermsOfService() {
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
        <h1 style={{ fontFamily: '"Press Start 2P", monospace', fontSize: '24px', marginBottom: '30px', textAlign: 'center' }}>TERMS OF SERVICE</h1>
        <p style={{ marginBottom: '20px' }}>Last updated: {new Date().toLocaleDateString('en-US')}</p>
        
        <h2 style={{ color: '#3498db', marginTop: '30px' }}>1. Acceptance of Terms</h2>
        <p>By accessing or using Project T (ft_transcendence), you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using or accessing this site.</p>

        <h2 style={{ color: '#3498db', marginTop: '30px' }}>2. Use License</h2>
        <p>Permission is granted to temporarily download one copy of the materials (information or software) on Project T's website for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:</p>
        <ul style={{ marginLeft: '20px', marginTop: '10px' }}>
          <li>modify or copy the materials;</li>
          <li>use the materials for any commercial purpose, or for any public display (commercial or non-commercial);</li>
          <li>attempt to decompile or reverse engineer any software contained on Project T's website;</li>
          <li>remove any copyright or other proprietary notations from the materials; or</li>
          <li>transfer the materials to another person or "mirror" the materials on any other server.</li>
        </ul>

        <h2 style={{ color: '#3498db', marginTop: '30px' }}>3. Fair Play and Conduct</h2>
        <p>As a multiplayer game platform, we expect all users to engage in fair play and respectful behavior. The following actions are strictly prohibited and may result in account termination:</p>
        <ul style={{ marginLeft: '20px', marginTop: '10px' }}>
          <li>Using cheats, bots, or any third-party software to gain an unfair advantage.</li>
          <li>Harassing, threatening, or engaging in hate speech against other users.</li>
          <li>Exploiting bugs or glitches for personal gain.</li>
        </ul>

        <h2 style={{ color: '#3498db', marginTop: '30px' }}>4. Disclaimer</h2>
        <p>The materials on Project T's website are provided on an 'as is' basis. Project T makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.</p>

        <h2 style={{ color: '#3498db', marginTop: '30px' }}>5. Limitations</h2>
        <p>In no event shall Project T or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on Project T's website, even if Project T or a Project T authorized representative has been notified orally or in writing of the possibility of such damage.</p>
        
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
