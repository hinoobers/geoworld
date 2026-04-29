import Header from "../../components/Header/Header";
import "../Legal/Legal.css";
import "./FaqPage.css";

const FAQS = [
    {
        q: "How is GeoWorld different from GeoGuessr?",
        a: "GeoWorld is a free-to-play alternative to GeoGuessr. We do not limit how much and what you can play.",
    },
    {
        q: "Why do I need an account?",
        a: "An account lets us prevent abuse, track your stats, save the maps you create, let you play with friends in multiplayer, and put you on the leaderboards. Without an account you can still try the demo, but multiplayer, custom maps, and progression all need an identity to attach to.",
    },
    {
        q: "Why do I need to verify my email?",
        a: "Email verification keeps the platform clean from throwaway and bot accounts that abuse google cloud api, multiplayer lobbies or map uploads. It also gives us a way to reach you for important account messages like password resets.",
    },
    {
        q: "Can I play without signing up?",
        a: "Yes - try the demo from the landing page. You get to test the game for free. For unlimited rounds, custom maps, country streaks, and multiplayer, you'll need an account.",
    },
    {
        q: "I didn't get my verification email - what now?",
        a: "Check your spam/junk folder first. You can request a new link from the verification prompt that appears when you try to play. We rate-limit resends to keep mail providers happy, so if you've sent several recently, wait a bit and try again.",
    },
    {
        q: "How does scoring work?",
        a: "Your guess is compared to the actual location. The closer you are, the more points you score. Distance is shown in kilometers on the result screen. Max score is 5000 points for a perfect guess, and it decreases as the distance increases.",
    },
    {
        q: "Can I make my own maps?",
        a: "Yes. Logged-in users can build custom maps from the Maps page and either keep them private or share them with the community.",
    },
    {
        q: "I found a bug or have feedback - where do I send it?",
        a: "Reach out through our email hinoob@byenoob.com. Bug reports with reproduction steps are especially appreciated.",
    },
];

const FaqPage = () => (
    <div className="page">
        <Header />
        <main className="legal-page faq-page">
            <h1>Frequently Asked Questions</h1>
            <p className="legal-meta">Answers to the most common questions about GeoWorld.</p>

            <div className="faq-list">
                {FAQS.map((item, idx) => (
                    <details key={idx} className="faq-item">
                        <summary>{item.q}</summary>
                        <p>{item.a}</p>
                    </details>
                ))}
            </div>
        </main>
    </div>
);

export default FaqPage;
