export function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

// Shuffles MCQ choices and remaps correctIndex to match the new order
export function shuffleQuestionChoices(question) {
    const correctChoice = question.choices[question.correctIndex];
    const shuffledChoices = shuffleArray(question.choices);
    return {
        ...question,
        choices: shuffledChoices,
        correctIndex: shuffledChoices.indexOf(correctChoice),
    };
}

export function shuffleQuizQuestions(questions, mode) {
    const shuffled = shuffleArray(questions);
    if (mode === "mcq") {
        return shuffled.map(shuffleQuestionChoices);
    }
    return shuffled;
}
