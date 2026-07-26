import { TetrisGame } from './pages/TetrisGame';
import { Panel } from "@/components/UI/Panel"
import './App.css';

function App() {
  // return <TetrisGame />;

  return (
    <Panel glow="cyan">
      <h2>Panel</h2>
      <p>最初のコンポーネント</p>
    </Panel>
  )
}

export default App;
