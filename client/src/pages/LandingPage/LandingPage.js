import { useNavigate } from "react-router-dom";
import Header from "../../components/Header/Header";
import "./LandingPage.css";

const LandingPage = () => {
    let navigate = useNavigate();
    return (
        <div className="page">
            <Header />

            <div className="content">
                <div className="landing-page">
                    <h1>GeoWorld</h1>
                    <p>Where guess meets location</p>
                    <div className="buttons">
                        <button onClick={() => navigate("/login")}>Log in</button>
                        <button onClick={() => navigate("/signup")}>Create Account</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LandingPage;

