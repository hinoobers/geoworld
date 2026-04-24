import './App.css';
import {BrowserRouter, Routes, Route} from 'react-router-dom';
import LandingPage from './pages/LandingPage/LandingPage';
import Login from './pages/Account/Login/Login';
import Signup from './pages/Account/Signup/Signup';
import { AuthProvider } from './context/AuthContext';
import FrontPage from './pages/HomePage/FrontPage';
import PlayPage from './pages/PlayPage/PlayPage';
import CreateMapPage from './pages/CreateMapPage/CreateMapPage';
import CommunityMapsPage from './pages/CommunityMapsPage/CommunityMapsPage';
import DailyResultsPage from './pages/DailyResultsPage/DailyResultsPage';
import GamesPage from './pages/GamesPage/GamesPage';
import LobbyPage from './pages/LobbyPage/LobbyPage';
import MultiplayerGamePage from './pages/MultiplayerGamePage/MultiplayerGamePage';
import RequireUser from './components/RequireUser/RequireUser';
import AdminPage from './pages/AdminPage/AdminPage';
import PrivacyPolicy from './pages/Legal/PrivacyPolicy';
import TermsOfService from './pages/Legal/TermsOfService';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/home" element={<RequireUser><FrontPage /></RequireUser>} />
          <Route path="/play" element={<RequireUser><PlayPage /></RequireUser>} />
          <Route path="/maps/create" element={<RequireUser><CreateMapPage /></RequireUser>} />
          <Route path="/community" element={<RequireUser><CommunityMapsPage /></RequireUser>} />
          <Route path="/games" element={<RequireUser><GamesPage /></RequireUser>} />
          <Route path="/daily-results" element={<RequireUser><DailyResultsPage /></RequireUser>} />
          <Route path="/lobby/:code" element={<LobbyPage />} />
          <Route path="/multiplayer/:code" element={<MultiplayerGamePage />} />
          <Route path="/admin" element={<RequireUser><AdminPage /></RequireUser>} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
