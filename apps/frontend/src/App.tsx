import { Routes, Route, Navigate } from "react-router-dom"

import AuthCallback from "@/pages/AuthCallback"
import Login from "@/pages/Login"
import { AppShell } from "@/components/AppShell"
import  Dashboard  from "@/pages/Dashboard"
import Chat  from "@/pages/Chat"
import Friends from "@/pages/Friends"
import Profile from "@/pages/Profile"
import BattleSetup from "@/pages/BattleSetup"
import TetrisGame from "@/pages/TetrisGame"

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/profile" element={<Profile />} />
      </Route>

      <Route path="/game" element={<TetrisGame />} />
      <Route path="/battle-setup" element={<BattleSetup />} />
      { /* <Route path="/battle" element={<Battle />} />   */}

      {/* どこにも適さないURL */ }
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}