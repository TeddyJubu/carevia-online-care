import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth';
import { Shell } from './components/Shell';
import { Booking } from './pages/Booking';
import { DoctorProfile } from './pages/DoctorProfile';
import { Doctors } from './pages/Doctors';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { VideoVisit } from './pages/VideoVisit';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Landing />} />
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
            <Route path="doctors" element={<Doctors />} />
            <Route path="doctors/:doctorId" element={<DoctorProfile />} />
            <Route path="book/:doctorId" element={<Booking />} />
            <Route path="visits/:appointmentId" element={<VideoVisit />} />
            <Route path="*" element={<Landing />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
