import { Routes, Route, Navigate, useLocation } from "react-router-dom"
import { lazy, Suspense } from 'react'
import { legacyDashboardDestination } from '@/lib/profileHub'


const Login = lazy(() => import('@/pages/Login'))
const Chat = lazy(() => import('@/pages/Chat'))
const Friends = lazy(() => import('@/pages/Friends'))
const AdvancedSearch = lazy(() => import('@/pages/AdvancedSearch'))
const Profile = lazy(() => import('@/pages/Profile'))
const PublicProfile = lazy(() => import('@/pages/PublicProfile'))
const Settings = lazy(() => import('@/pages/Settings'))
const AdminPanel = lazy(() => import('@/pages/AdminPanel'))
const JoinPage = lazy(() => import('@/pages/JoinPage'))
const MenuPage = lazy(() => import('@/pages/MenuPage'))
const LobbyPage = lazy(() => import('@/pages/LobbyPage'))
const PlayPage = lazy(() => import('@/pages/PlayPage'))
const AiPreviewPage = lazy(() => import('@/pages/AiPreviewPage'))
const PrivacyPolicy = lazy(() => import('@/pages/PrivacyPolicy'))
const TermsOfService = lazy(() => import('@/pages/TermsOfService'))

const OAuthCallback = lazy(() => import('@/pages/OAuthCallback').then(module => ({ default: module.OAuthCallback })))

function LegacyDashboardRedirect() {
  const location = useLocation();
  return <Navigate to={legacyDashboardDestination(location.search)} replace />;
}

export default function App() {
  return (
    <Suspense fallback={<div role="status" aria-live="polite" style={{ padding: 32 }}>LOADING…</div>}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<OAuthCallback />} />
      <Route path="/chat" element={<Chat />} />
      <Route path="/friends" element={<Friends />} />
      <Route path="/search" element={<AdvancedSearch />} />

      <Route path="/dashboard" element={<LegacyDashboardRedirect />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/profile/:id" element={<PublicProfile />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/admin" element={<AdminPanel />} />

      {/* TOPページ（JOIN -> ゲーム） */}
      <Route path="/" element={<JoinPage />} />
      <Route path="/menu" element={<MenuPage />} />
      <Route path="/lobby/:mode" element={<LobbyPage />} />
      <Route path="/play/:mode" element={<PlayPage />} />
      <Route path="/ai-preview" element={<AiPreviewPage />} />
      
      {/* 法的ページ */}
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
      <Route path="/terms-of-service" element={<TermsOfService />} />
      
      {/* どこにも適さないURLはTOPへ */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  )
}
