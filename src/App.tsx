import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import InviteAccept from "@/pages/InviteAccept";
import RequireAuth from "@/components/RequireAuth";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminGallery from "@/pages/AdminGallery";
import ClientGallery from "@/pages/ClientGallery";
import CheckoutResult from "@/pages/CheckoutResult";
import { useAuthBootstrap } from "@/hooks/useAuthBootstrap";

export default function App() {
  useAuthBootstrap()

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/invite" element={<InviteAccept />} />

        <Route
          path="/admin"
          element={
            <RequireAuth role="photographer">
              <AdminDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/g/:galleryId"
          element={
            <RequireAuth role="photographer">
              <AdminGallery />
            </RequireAuth>
          }
        />

        <Route
          path="/g/:galleryId"
          element={
            <RequireAuth>
              <ClientGallery />
            </RequireAuth>
          }
        />

        <Route path="/checkout/success" element={<RequireAuth><CheckoutResult mode="success" /></RequireAuth>} />
        <Route path="/checkout/cancel" element={<RequireAuth><CheckoutResult mode="cancel" /></RequireAuth>} />
      </Routes>
    </Router>
  );
}
