import React, { useState } from "react";

function App() {
    const [ticker, setTicker] = useState(""); // State for stock ticker input
    const [predictions, setPredictions] = useState(null); // State for predictions
    const [error, setError] = useState(""); // State for error messages

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(""); // Reset error state
        try {
            const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;
            const response = await fetch(`${API_BASE_URL}/predict`, {

                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ stock_ticker: ticker }),
            });
            if (!response.ok) {
                throw new Error("Failed to fetch predictions.");
            }
            const data = await response.json();
            setPredictions(data.predictions); // Update predictions state
        } catch (error) {
            console.error("Error:", error);
            setError("Error connecting to the server.");
        }
    };

    return (
        <div>
            <h1>Stock Prediction App</h1>
            <form onSubmit={handleSubmit}>
                <input
                    type="text"
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value)}
                    placeholder="Enter Stock Ticker"
                />
                <button type="submit">Get Predictions</button>
            </form>
            {predictions && (
                <div>
                    <h2>Predictions:</h2>
                    <ul>
                        {predictions.map((pred, index) => (
                            <li key={index}>
                                Day {index + 1}: {pred.toFixed(2)}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {error && <p style={{ color: "red" }}>{error}</p>}
        </div>
    );
}

export default App;
