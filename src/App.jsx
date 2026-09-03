import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import NavBar from "./components/NavBar.jsx";
import AuthPage from "./components/AuthPage.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Home from "./pages/Home.jsx";
import QuizRunnerPage from "./pages/QuizRunnerPage.jsx";
import Library from "./pages/Library.jsx";
import SharedQuiz from "./pages/SharedQuiz.jsx";
import CreateQuiz from "./pages/CreateQuiz.jsx";

export default function App() {
    const [activeQuiz, setActiveQuiz] = useState(null);

    return (
        <div className="app-shell">
            <NavBar />
            <Routes>
                <Route
                    path="/"
                    element={<Home setActiveQuiz={setActiveQuiz} />}
                />
                <Route
                    path="/play"
                    element={
                        <QuizRunnerPage
                            activeQuiz={activeQuiz}
                            setActiveQuiz={setActiveQuiz}
                        />
                    }
                />
                <Route path="/auth" element={<AuthPage />} />
                <Route
                    path="/library"
                    element={
                        <ProtectedRoute>
                            <Library setActiveQuiz={setActiveQuiz} />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/create"
                    element={
                        <ProtectedRoute>
                            <CreateQuiz />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/shared/:code"
                    element={<SharedQuiz setActiveQuiz={setActiveQuiz} />}
                />
            </Routes>
        </div>
    );
}
