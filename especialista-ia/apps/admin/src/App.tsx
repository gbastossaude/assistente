import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import type { Role } from "@especialista/shared";
import { Spinner } from "@especialista/ui";
import { AppLayout } from "./components/layout.tsx";
import { AuthProvider, useAuth } from "./lib/auth.tsx";
import { useBranding } from "./lib/branding.ts";
import { AuditPage } from "./pages/audit.tsx";
import { CollaboratorsPage } from "./pages/collaborators.tsx";
import { ConsultPage } from "./pages/consult.tsx";
import { DashboardPage } from "./pages/dashboard.tsx";
import { DocumentsPage } from "./pages/documents.tsx";
import { HandoffsPage } from "./pages/handoffs.tsx";
import { LoginPage, ResetPasswordPage } from "./pages/login.tsx";
import { QuestionsPage } from "./pages/questions.tsx";
import { RulesPage } from "./pages/rules.tsx";
import { SettingsPage } from "./pages/settings.tsx";

function Guard({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { can } = useAuth();
  return can(...roles) ? <>{children}</> : <Navigate to="/consultar" replace />;
}

function Shell() {
  const { session, profile, recovery } = useAuth();
  const branding = useBranding(Boolean(profile));
  if (session === undefined) return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>;
  if (recovery && session) return <ResetPasswordPage />;
  if (!session || !profile) return session && !profile ? <div className="flex min-h-screen items-center justify-center"><Spinner /></div> : <LoginPage branding={branding} />;
  const staff: Role[] = ["admin", "editor"];
  return (
    <Routes>
      <Route element={<AppLayout branding={branding} />}>
        <Route index element={profile.role === "colaborador" ? <Navigate to="/consultar" replace /> : <DashboardPage />} />
        <Route path="consultar" element={<ConsultPage />} />
        <Route path="documentos" element={<Guard roles={staff}><DocumentsPage /></Guard>} />
        <Route path="perguntas" element={<Guard roles={staff}><QuestionsPage /></Guard>} />
        <Route path="atendimentos" element={<Guard roles={staff}><HandoffsPage /></Guard>} />
        <Route path="regras" element={<Guard roles={staff}><RulesPage /></Guard>} />
        <Route path="colaboradores" element={<Guard roles={["admin"]}><CollaboratorsPage /></Guard>} />
        <Route path="configuracoes" element={<Guard roles={["admin"]}><SettingsPage /></Guard>} />
        <Route path="auditoria" element={<Guard roles={["admin"]}><AuditPage /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
      <Toaster richColors position="top-right" closeButton />
    </AuthProvider>
  );
}
