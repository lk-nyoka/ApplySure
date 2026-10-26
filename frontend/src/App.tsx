import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import { AppShell } from './components/AppShell'
import { OfflineBanner } from './components/OfflineBanner'
import { configurationError } from './lib/supabase'
import { ForgotPasswordPage, ResetPasswordPage } from './pages/auth/ForgotPasswordPage'
import { LoginPage } from './pages/auth/LoginPage'
import { SignupPage } from './pages/auth/SignupPage'
import { InfoPage, LandingPage } from './pages/LandingPage'
import { WorkspaceProvider } from './workspace/WorkspaceProvider'

// Signed-in pages load on first visit, so the landing and sign-in screens download less on mobile data.
const ApplicationDetailPage = lazy(() => import('./pages/ApplicationsPage').then(m => ({ default: m.ApplicationDetailPage })))
const ApplicationsPage = lazy(() => import('./pages/ApplicationsPage').then(m => ({ default: m.ApplicationsPage })))
const BursariesPage = lazy(() => import('./pages/BursariesPage').then(m => ({ default: m.BursariesPage })))
const BursaryDetailPage = lazy(() => import('./pages/BursaryDetailPage').then(m => ({ default: m.BursaryDetailPage })))
const RequirementCheckPage = lazy(() => import('./pages/check/RequirementCheckPage').then(m => ({ default: m.RequirementCheckPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })))
const DocumentsPage = lazy(() => import('./pages/DocumentsPage').then(m => ({ default: m.DocumentsPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })))

const SessionLoading = () => <main className="center" role="status"><span className="spinner" />Loading your session…</main>
const PageLoading = () => <div className="center" role="status" style={{ minHeight: "40vh" }}><span className="spinner" />Loading…</div>

function Protected({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  const { pathname, search } = useLocation()
  if (loading) return <SessionLoading />
  if (!session) return <Navigate to="/login" replace state={{ from: pathname + search }} />
  return children
}

/** Signed-in visitors skip the landing and auth pages. */
function PublicOnly({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <SessionLoading />
  if (session) return <Navigate to="/dashboard" replace />
  return children
}

function Pages() {
  const { session } = useAuth()
  return <WorkspaceProvider userId={session?.user.id}><AppShell><Suspense fallback={<PageLoading />}><Routes>
    <Route path="/dashboard" element={<DashboardPage />} />
    <Route path="/check" element={<RequirementCheckPage />} />
    <Route path="/bursaries" element={<BursariesPage />} />
    <Route path="/bursaries/:id" element={<BursaryDetailPage />} />
    <Route path="/applications" element={<ApplicationsPage />} />
    <Route path="/applications/:id" element={<ApplicationDetailPage />} />
    <Route path="/documents" element={<DocumentsPage />} />
    <Route path="/profile" element={<ProfilePage />} />
    <Route path="/uploads" element={<Navigate to="/documents" replace />} />
    <Route path="/settings" element={<Navigate to="/profile" replace />} />
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes></Suspense></AppShell></WorkspaceProvider>
}

export default function App() {
  if (configurationError) return <main className="center setup"><h1>Setup needed</h1><p>{configurationError}</p><p>Use your Supabase project's public key. Keep secret keys on the server.</p></main>
  return <><OfflineBanner /><Routes>
    <Route path="/" element={<PublicOnly><LandingPage /></PublicOnly>} />
    <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
    <Route path="/signup" element={<PublicOnly><SignupPage /></PublicOnly>} />
    <Route path="/forgot-password" element={<PublicOnly><ForgotPasswordPage /></PublicOnly>} />
    <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route path="/privacy" element={<InfoPage page="privacy" />} />
    <Route path="/terms" element={<InfoPage page="terms" />} />
    <Route path="/support" element={<InfoPage page="support" />} />
    <Route path="/*" element={<Protected><Pages /></Protected>} />
  </Routes></>
}
