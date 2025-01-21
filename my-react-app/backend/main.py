from fastapi import FastAPI
from pydantic import BaseModel
from typing import List
import numpy as np
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import mean_squared_error
from xgboost import XGBRegressor
import yfinance as yf
import matplotlib.pyplot as plt

from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout

# Add CORS middleware
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins; update for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helper functions
def fetch_stock_data(ticker, start_date, end_date):
    stock_data = yf.download(ticker, start=start_date, end=end_date)
    return stock_data

def prepare_lstm_data(data, look_back=30):
    X, y = [], []
    for i in range(len(data) - look_back):
        X.append(data[i:i + look_back])
        y.append(data[i + look_back])
    return np.array(X), np.array(y)

def AutoML2(stock_ticker):
    # Fetch stock data
    ticker = stock_ticker
    start_date = "2023-01-01"
    end_date = "2024-12-31"
    stock_data = fetch_stock_data(ticker, start_date, end_date)

    # Scale the data
    scaler = MinMaxScaler(feature_range=(0, 1))
    scaled_data = scaler.fit_transform(stock_data[['Close']].values)

    look_back = 30  # Number of days to look back

    # Prepare training and testing data
    train_end_index = len(scaled_data) - look_back - 30
    X_train, y_train = prepare_lstm_data(scaled_data[:train_end_index], look_back=look_back)
    X_test, y_test = prepare_lstm_data(scaled_data[train_end_index:], look_back=look_back)

    # Reshape for LSTM
    X_train_lstm = X_train.reshape(X_train.shape[0], X_train.shape[1], 1)
    X_test_lstm = X_test.reshape(X_test.shape[0], X_test.shape[1], 1)

    # Train LSTM model
    lstm_model = Sequential([
        LSTM(50, return_sequences=True, input_shape=(look_back, 1)),
        Dropout(0.2),
        LSTM(50, return_sequences=False),
        Dropout(0.2),
        Dense(1)
    ])
    lstm_model.compile(optimizer='adam', loss='mean_squared_error')
    lstm_model.fit(X_train_lstm, y_train, epochs=5, batch_size=32, verbose=1)
    lstm_predictions = lstm_model.predict(X_test_lstm)

    # Train XGBoost model
    xgb_model = XGBRegressor()
    xgb_model.fit(X_train.reshape(X_train.shape[0], -1), y_train)
    xgb_predictions = xgb_model.predict(X_test.reshape(X_test.shape[0], -1))

    # Inverse transform predictions
    lstm_predictions = scaler.inverse_transform(lstm_predictions)
    xgb_predictions = scaler.inverse_transform(xgb_predictions.reshape(-1, 1))
    y_test_unscaled = scaler.inverse_transform(y_test.reshape(-1, 1))

    # Calculate RMSE
    lstm_rmse = np.sqrt(mean_squared_error(y_test_unscaled, lstm_predictions))
    xgb_rmse = np.sqrt(mean_squared_error(y_test_unscaled, xgb_predictions))

    # Choose the best model
    if lstm_rmse < xgb_rmse:
        best_predictions = lstm_predictions.flatten()
    else:
        best_predictions = xgb_predictions.flatten()

    return best_predictions.tolist()

# Request Models
class PredictionRequest(BaseModel):
    stock_ticker: str

# Endpoints
@app.post("/predict")
def predict(request: PredictionRequest):
    stock_ticker = request.stock_ticker
    predictions = AutoML2(stock_ticker)
    return {"stock_ticker": stock_ticker, "predictions": predictions}

@app.get("/")
def root():
    return {"message": "Stock Prediction API is running!"}

from fastapi.staticfiles import StaticFiles

# Mount the "backend" folder to serve static files (like index.html)
app.mount("/", StaticFiles(directory="backend", html=True), name="static")
