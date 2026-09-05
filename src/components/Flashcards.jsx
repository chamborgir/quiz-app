import { useState } from "react";
import FormattedText from "./FormattedText.jsx";

export default function Flashcards({ questions, onFinish }) {
    const [index, setIndex] = useState(0);
    const [flipped, setFlipped] = useState(false);
    const [transitioning, setTransitioning] = useState(false);

    const current = questions[index];
    const isLast = index === questions.length - 1;

    const showImageOnFront =
        !!current.imageUrl &&
        current.imagePosition !== "back" &&
        current.frontDisplay !== "text";
    const showTextOnFront =
        !current.imageUrl ||
        current.imagePosition === "back" ||
        current.frontDisplay !== "image";

    const showImageOnBack =
        !!current.imageUrl &&
        current.imagePosition === "back" &&
        current.frontDisplay !== "text";
    const showTextOnBack =
        !current.imageUrl ||
        current.imagePosition !== "back" ||
        current.frontDisplay !== "image";

    function goTo(action) {
        if (transitioning) return;
        setTransitioning(true);
        setFlipped(false);
        setTimeout(() => {
            action();
            setTransitioning(false);
        }, 500);
    }

    function next() {
        goTo(() => {
            if (isLast) onFinish();
            else setIndex((i) => i + 1);
        });
    }

    function prev() {
        goTo(() => setIndex((i) => Math.max(0, i - 1)));
    }

    return (
        <div className="card">
            <div className="progress">
                Card {index + 1} of {questions.length}
            </div>

            <div
                className={`flashcard-wrap ${flipped ? "flipped" : ""} ${transitioning ? "transitioning" : ""}`}
                onClick={() => !transitioning && setFlipped((f) => !f)}
            >
                <div className="flashcard-inner">
                    <div className="flashcard-face flashcard-front">
                        {showImageOnFront && (
                            <img
                                src={current.imageUrl}
                                alt=""
                                className="quiz-image"
                            />
                        )}
                        {showTextOnFront && (
                            <FormattedText text={current.front} />
                        )}
                    </div>
                    <div className="flashcard-face flashcard-back">
                        {showImageOnBack && (
                            <img
                                src={current.imageUrl}
                                alt=""
                                className="quiz-image"
                            />
                        )}
                        {showTextOnBack && (
                            <FormattedText text={current.back} />
                        )}
                    </div>
                </div>
            </div>

            <p className="hint">Tap the card to flip</p>

            <div className="nav-row">
                <button
                    className="btn btn-secondary"
                    onClick={prev}
                    disabled={index === 0 || transitioning}
                >
                    Prev
                </button>
                <button className="btn" onClick={next} disabled={transitioning}>
                    {isLast ? "Finish" : "Next"}
                </button>
            </div>
        </div>
    );
}
