
import type { UserStats, GameRecordView } from '../../lib/types';
import { HISTORY_COLUMNS, historyCsv, historyRows } from '../../lib/historyExport';

interface DataExportButtonsProps {
  stats: UserStats;
  games: GameRecordView[];
  username: string;
}

export function DataExportButtons({ stats, games, username }: DataExportButtonsProps) {
  
  const handleExportCSV = () => {
    if (!games || games.length === 0) {
      alert("No game history to export.");
      return;
    }

    const csvContent = historyCsv(games);

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `tetris_history_${username}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleExportPDF = async () => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(20);
    doc.setTextColor(52, 152, 219); // #3498db
    doc.text("TETRIS BATTLE REPORT", 14, 22);

    // Profile Info
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`Player: ${username}`, 14, 32);
    doc.text(`Export Date: ${new Date().toLocaleDateString()}`, 14, 40);

    // Stats Summary
    doc.setFontSize(14);
    doc.text("Overall Statistics (lifetime)", 14, 55);
    
    doc.setFontSize(10);
    doc.text(`Total Games: ${stats.totalGames}`, 14, 65);
    doc.text(`Win Rate: ${stats.winRate.toFixed(1)}% (${stats.wins}W - ${stats.losses}L)`, 14, 72);
    doc.text(`Best Streak: ${stats.bestWinStreak}`, 14, 79);
    doc.text(`Best APM: ${stats.bestApm.toFixed(2)} | Avg APM: ${stats.avgApm.toFixed(2)}`, 100, 65);
    doc.text(`Best PPS: ${stats.bestPps.toFixed(2)} | Avg PPS: ${stats.avgPps.toFixed(2)}`, 100, 72);

    // Match History Table
    doc.setFontSize(14);
    doc.text(`Filtered history (${games.length} loaded games, dates UTC)`, 14, 95);

    if (games && games.length > 0) {
      const tableData = historyRows(games);

      autoTable(doc, {
        startY: 100,
        head: [HISTORY_COLUMNS],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [52, 152, 219] },
      });
    } else {
      doc.setFontSize(10);
      doc.text("No match history available.", 14, 105);
    }

    doc.save(`tetris_report_${username}.pdf`);
  };

  const btnStyle = {
    padding: '10px 15px',
    fontSize: '10px',
    color: 'white',
    border: '2px solid #444',
    cursor: 'pointer',
    fontFamily: "'Press Start 2P', monospace",
    boxShadow: '2px 2px 0px rgba(0,0,0,1)',
  };

  return (
    <div style={{ display: 'flex', gap: '10px' }}>
      <button 
        onClick={handleExportCSV} 
        style={{ ...btnStyle, backgroundColor: '#2ecc71' }}
        onMouseDown={(e) => e.currentTarget.style.transform = 'translate(2px, 2px)'}
        onMouseUp={(e) => e.currentTarget.style.transform = 'none'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
      >
        📄 CSV
      </button>
      <button 
        onClick={handleExportPDF} 
        style={{ ...btnStyle, backgroundColor: '#e74c3c' }}
        onMouseDown={(e) => e.currentTarget.style.transform = 'translate(2px, 2px)'}
        onMouseUp={(e) => e.currentTarget.style.transform = 'none'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
      >
        📊 PDF
      </button>
    </div>
  );
}
