import { TetrisGame } from './pages/TetrisGame';
import './App.css';


import { Panel } from "@/components/UI/Panel"
import { NeonBtn } from "@/components/UI/NeonBtn"

function App() {
  // return <TetrisGame />;

  return (
      <div>
        <NeonBtn color="red" onClick={() => alert("hello")}>PLAY</NeonBtn>
      </div>
  )
}

export default App;
