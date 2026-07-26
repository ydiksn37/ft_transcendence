import { TetrisGame } from './pages/TetrisGame';
import './App.css';


import { Panel } from "@/components/UI/Panel"
import { NeonBtn } from "@/components/UI/NeonBtn"
import { NeonInput } from "@/components/UI/NeonInput"
import { AvatarIcon } from "@/components/UI/AvatarIcon"
import { getAvatarPreset } from './lib/avatarPresets';

function App() {
  // return <TetrisGame />;
  const preset = getAvatarPreset(0);
  return (
      <div>
        <AvatarIcon color={preset.color} symbol={preset.symbol} size={80} />
      </div>
  )
}

export default App;
