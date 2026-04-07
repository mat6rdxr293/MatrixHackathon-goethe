import { AnimatePresence } from "framer-motion";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { PortalLayout } from "../layout/PortalLayout";
import { AuthRoute, ProtectedRoute, RoleRoute } from "./guards";
import { AchievementsPage } from "../pages/AchievementsPage";
import { AdminAnalyticsPage } from "../pages/AdminAnalyticsPage";
import { AdminContentPage } from "../pages/AdminContentPage";
import { AdminSchedulePage } from "../pages/AdminSchedulePage";
import { AdminUsersPage } from "../pages/AdminUsersPage";
import { AiMentorPage } from "../pages/AiMentorPage";
import { ClassesPage } from "../pages/ClassesPage";
import { DashboardPage } from "../pages/DashboardPage";
import { EventsPage } from "../pages/EventsPage";
import { KioskPage } from "../pages/KioskPage";
import { LandingPage } from "../pages/LandingPage";
import { LoginPage } from "../pages/LoginPage";
import { NotificationsPage } from "../pages/NotificationsPage";
import { ProfilePage } from "../pages/ProfilePage";
import { ProgressPage } from "../pages/ProgressPage";
import { SchedulePage } from "../pages/SchedulePage";
import { SubjectsPage } from "../pages/SubjectsPage";
import { SubjectPage } from "../pages/SubjectPage";

export function AppRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<LandingPage />} />

        <Route element={<AuthRoute />}>
          <Route path="/login" element={<LoginPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route path="/app" element={<PortalLayout />}>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="progress" element={<ProgressPage />} />
            <Route path="achievements" element={<AchievementsPage />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="schedule" element={<SchedulePage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="ai-mentor" element={<AiMentorPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="students/:studentId" element={<ProfilePage />} />
            <Route path="subjects" element={<SubjectsPage />} />
            <Route path="subjects/:subjectId" element={<SubjectPage />} />

            <Route element={<RoleRoute roles={["teacher", "admin"]} />}>
              <Route path="classes" element={<ClassesPage />} />
            </Route>

            <Route element={<RoleRoute roles={["admin"]} />}>
              <Route path="admin/analytics" element={<AdminAnalyticsPage />} />
              <Route path="admin/schedule" element={<AdminSchedulePage />} />
              <Route path="admin/users" element={<AdminUsersPage />} />
              <Route path="admin/content" element={<AdminContentPage />} />
            </Route>
          </Route>

          <Route element={<RoleRoute roles={["admin"]} />}>
            <Route path="/kiosk" element={<KioskPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

