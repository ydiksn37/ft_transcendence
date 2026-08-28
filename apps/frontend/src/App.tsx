import { Routes, Route, Navigate } from "react-router-dom"


import Login from "@/pages/Login"
import Dashboard from "@/pages/Dashboard"
import Chat from "@/pages/Chat"
import Friends from "@/pages/Friends"
import Profile from "@/pages/Profile"
import Settings from "@/pages/Settings"
import JoinPage from "@/pages/JoinPage"
import MenuPage from "@/pages/MenuPage"
import LobbyPage from "@/pages/LobbyPage"
import PlayPage from "@/pages/PlayPage"
import AiPreviewPage from "@/pages/AiPreviewPage"

import { OAuthCallback } from "@/pages/OAuthCallback"

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<OAuthCallback />} />
      <Route path="/chat" element={<Chat />} />
      <Route path="/friends" element={<Friends />} />

      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/settings" element={<Settings />} />

      {/* TOPページ（JOIN -> ゲーム） */}
      <Route path="/" element={<JoinPage />} />
      <Route path="/menu" element={<MenuPage />} />
      <Route path="/lobby/:mode" element={<LobbyPage />} />
      <Route path="/play/:mode" element={<PlayPage />} />
      <Route path="/ai-preview" element={<AiPreviewPage />} />
      
      {/* どこにも適さないURLはTOPへ */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
