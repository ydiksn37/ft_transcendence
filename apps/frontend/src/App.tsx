import { TetrisGame } from './pages/TetrisGame';
import './App.css';


import { Panel } from "@/components/UI/Panel"
import { NeonBtn } from "@/components/UI/NeonBtn"
import { NeonInput } from "@/components/UI/NeonInput"

function App() {
  // return <TetrisGame />;

  return (
      <div>
        <NeonInput placeholder='ユーザー名'/>
        <NeonInput type='password' placeholder='パスワード' />
      </div>
  )
}

export default App;
