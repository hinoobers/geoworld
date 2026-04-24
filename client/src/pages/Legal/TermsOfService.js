import { Link } from "react-router-dom";
import Header from "../../components/Header/Header";
import "./Legal.css";

const LAST_UPDATED = "2026-04-24";

const TermsOfService = () => (
    <div className="page">
        <Header />
        <main className="legal-page">
            <h1>Terms of Service</h1>
            <p className="legal-meta">Last updated: {LAST_UPDATED}</p>

            <h2>About GeoWorld</h2>
            <p>
                GeoWorld is a hobby geography guessing game inspired by GeoGuessr. You are dropped
                into a Street View location and guess where you are on a map. It is a fan project,
                not affiliated with, endorsed by, or sponsored by GeoGuessr AB or Google.
            </p>

            <h2>Your account</h2>
            <p>
                You're responsible for what happens on your account. Don't share your password. Keep
                your login to yourself. One person, one account.
            </p>

            <h2>Fair play</h2>
            <ul>
                <li>No cheating — don't use scripts, bots, or external tools to read coordinates from Street View.</li>
                <li>No exploiting bugs for score. If you find one, report it instead of farming it.</li>
                <li>Don't intentionally throw matches to grief teammates in multiplayer.</li>
                <li>Don't spam lobbies, messages, or map creation.</li>
            </ul>

            <h2>Community rules</h2>
            <ul>
                <li>No harassment, hate speech, threats, or impersonation.</li>
                <li>No slurs or targeted abuse in usernames, map names, or descriptions.</li>
                <li>Don't create maps that target, dox, or mock real individuals or private homes.</li>
                <li>Keep content appropriate — no illegal content, no sexual content involving minors, no content that infringes others' rights.</li>
            </ul>

            <h2>Your maps and content</h2>
            <p>
                You own the maps you create. By marking a map public, you let other players use it in
                their own singleplayer runs and lobbies. You can unpublish or delete your maps any
                time from the Edit menu.
            </p>

            <h2>API and rate limits</h2>
            <p>
                Don't scrape or hammer the API. Don't try to bypass rate limits on the Street View
                endpoint or any other endpoint. Automated abuse gets your account banned and the
                offending IP blocked.
            </p>

            <h2>Availability</h2>
            <p>
                GeoWorld runs as-is. There are no uptime guarantees, features may change, and in
                rare cases data (scores, in-progress games) may be lost during maintenance.
            </p>

            <h2>Enforcement</h2>
            <p>
                Accounts that break these rules can be suspended or removed without notice, and
                their maps may be taken down. Repeated abuse, especially anything designed to drive
                up hosting costs, will get you permanently banned.
            </p>

            <h2>Changes</h2>
            <p>
                These terms can change. Continued use after a change means you accept the new
                version. The date at the top is updated when anything material changes.
            </p>

            <p className="legal-footer"><Link to="/">← Back to home</Link></p>
        </main>
    </div>
);

export default TermsOfService;
