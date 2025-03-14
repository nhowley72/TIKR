import React, { useState } from "react";
import "./App.css";

function App() {
    const [ticker, setTicker] = useState(""); // State for stock ticker input
    const [predictionData, setPredictionData] = useState(null); // State for prediction data
    const [loading, setLoading] = useState(false); // State for loading indicator
    const [error, setError] = useState(""); // State for error messages

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(""); // Reset error state
        setLoading(true); // Set loading state
        
        try {
            // Use the updated API endpoint
            const response = await fetch("https://tikr-ezii.onrender.com/predict", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ stock_ticker: ticker }),
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Failed to fetch predictions.");
            }
            
            const data = await response.json();
            setPredictionData(data); // Update prediction data state with the full response
        } catch (error) {
            console.error("Error:", error);
            setError(error.message || "Error connecting to the server.");
        } finally {
            setLoading(false); // Clear loading state
        }
    };

    // Format currency
    const formatCurrency = (value) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(value);
    };

    // Format percentage
    const formatPercentage = (value) => {
        return new Intl.NumberFormat('en-US', {
            style: 'percent',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value / 100);
    };

    return (
        <div className="app-container">
            <h1>TIKR Stock Prediction App</h1>
            <p className="description">
                Get 30-day stock price predictions for major tech companies and more.
            </p>
            
            <div className="form-container">
                <form onSubmit={handleSubmit}>
                    <input
                        className="input-field"
                        type="text"
                        value={ticker}
                        onChange={(e) => setTicker(e.target.value.toUpperCase())}
                        placeholder="Enter Stock Ticker (e.g., AAPL)"
                    />
                    <button 
                        className="submit-button" 
                        type="submit"
                        disabled={loading}
                    >
                        {loading ? "Loading..." : "Get Predictions"}
                    </button>
                </form>
            </div>
            
            {error && <p className="error-message">{error}</p>}
            
            {predictionData && (
                <div className="prediction-container">
                    <h2>{predictionData.name} ({predictionData.ticker}) Prediction</h2>
                    
                    <div className="prediction-summary">
                        <div className="prediction-card">
                            <h3>Current Price</h3>
                            <p className="price">{formatCurrency(predictionData.currentPrice)}</p>
                        </div>
                        
                        <div className="prediction-card">
                            <h3>Predicted Price (30 days)</h3>
                            <p className="price">{formatCurrency(predictionData.predictedPrice)}</p>
                            <p className={`change ${predictionData.change >= 0 ? 'positive' : 'negative'}`}>
                                {formatPercentage(predictionData.change)}
                            </p>
                        </div>
                        
                        <div className="prediction-card">
                            <h3>Confidence</h3>
                            <p className="confidence">{formatPercentage(predictionData.confidence)}</p>
                        </div>
                    </div>
                    
                    <div className="prediction-details">
                        <h3>30-Day Price Forecast</h3>
                        <div className="prediction-chart">
                            {/* Simple visual representation of predictions */}
                            <div className="chart-container">
                                {predictionData.rawPredictions.map((price, index) => (
                                    <div 
                                        key={index} 
                                        className="chart-bar"
                                        style={{ 
                                            height: `${(price / Math.max(...predictionData.rawPredictions)) * 100}%`,
                                            backgroundColor: price > predictionData.currentPrice ? '#4CAF50' : '#F44336'
                                        }}
                                        title={`Day ${index + 1}: ${formatCurrency(price)}`}
                                    />
                                ))}
                            </div>
                        </div>
                        
                        <div className="prediction-table">
                            <h4>Daily Predictions</h4>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Day</th>
                                        <th>Predicted Price</th>
                                        <th>Change</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {predictionData.rawPredictions.map((price, index) => {
                                        const dayChange = index === 0 
                                            ? ((price - predictionData.currentPrice) / predictionData.currentPrice) * 100
                                            : ((price - predictionData.rawPredictions[index - 1]) / predictionData.rawPredictions[index - 1]) * 100;
                                            
                                        return (
                                            <tr key={index}>
                                                <td>Day {index + 1}</td>
                                                <td>{formatCurrency(price)}</td>
                                                <td className={dayChange >= 0 ? 'positive' : 'negative'}>
                                                    {formatPercentage(dayChange)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    
                    <div className="prediction-footer">
                        <p>Last updated: {new Date(predictionData.lastUpdated).toLocaleString()}</p>
                        <p>Prediction method: {predictionData.method}</p>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
