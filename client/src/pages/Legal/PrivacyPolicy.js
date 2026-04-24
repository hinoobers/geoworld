import { Link } from "react-router-dom";
import Header from "../../components/Header/Header";
import "./Legal.css";

const LAST_UPDATED = "2026-04-24";

const PrivacyPolicy = () => (
    <div className="page">
        <Header />
        <main className="legal-page">
            <h1>Privacy Policy</h1>
            <p className="legal-meta">Last updated: {LAST_UPDATED}</p>

            <h2>What we collect</h2>
            <ul>
                <li><strong>Account data</strong> — your email, username, and a hashed password.</li>
                <li><strong>Game data</strong> — maps you create, games you play, your guesses and scores.</li>
                <li><strong>Session</strong> — a sign-in token stored in your browser so you stay logged in.</li>
                <li><strong>Guests</strong> — a temporary id so your actions in a lobby can be attributed.</li>
            </ul>

            <h2>What we don't do</h2>
            <ul>
                <li>We don't track you across other websites.</li>
                <li>We don't sell or share your data with advertisers.</li>
                <li>We don't store your password in plain text.</li>
            </ul>

            <h2>Third parties</h2>
            <p>
                The Street View panorama is rendered by Google Maps. Google sees the request for the
                panorama the same way any site embedding a Google Map does. The 2D guessing map uses
                OpenStreetMap / Esri tiles.
            </p>

            <h2>Retention</h2>
            <p>
                Your data stays while your account exists. If you delete your account, your maps and
                personal data are removed; past games may remain in anonymized form so leaderboards
                and opponents' match history stay consistent.
            </p>

            <h2>Your choices</h2>
            <p>
                You can update your maps, change visibility, or delete your account at any time.
                Contact the site operator for anything the UI doesn't cover.
            </p>

            <p className="legal-footer"><Link to="/">← Back to home</Link></p>
        </main>
    </div>
);

export default PrivacyPolicy;
