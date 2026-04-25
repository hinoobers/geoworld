import { useNavigate } from "react-router-dom";
import Header from "../../components/Header/Header";
import { useAuth } from "../../context/AuthContext";
import "./NotFoundPage.css";

const NotFoundPage = () => {
    const navigate = useNavigate();
    const { isLoggedIn } = useAuth();

    return (
        <div className="notfound-page">
            <Header />

            <main className="notfound-content">
                <div className="notfound-card">
                    <div className="notfound-mark">?</div>
                    <h1>Page not found</h1>
                    <p>The page you're looking for doesn't exist or has moved.</p>
                    <div className="notfound-actions">
                        <button
                            type="button"
                            className="notfound-primary"
                            onClick={() => navigate(isLoggedIn ? "/home" : "/")}
                        >
                            {isLoggedIn ? "Back to home" : "Back to landing"}
                        </button>
                        <button
                            type="button"
                            className="notfound-ghost"
                            onClick={() => navigate(-1)}
                        >
                            Go back
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default NotFoundPage;
