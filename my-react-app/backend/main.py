# main.py
from fastapi import FastAPI
from pydantic import BaseModel
import joblib
import yfinance as yf
import numpy as np

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PredictionRequest(BaseModel):
    stock_ticker: str

def fetch_stock_data(ticker, start_date, end_date):
    data = yf.download(ticker, start=start_date, end=end_date)
    data = data.dropna()
    return data

@app.post("/predict")
def predict(request: PredictionRequest):
    ticker = request.stock_ticker
    
    # Load the saved model and scaler for this ticker
    # (Make sure the files exist; otherwise handle the error.)
    model = joblib.load(f"/Users/noel_personal/Repos/TIKR/my-react-app/ml/models/{ticker}_model.joblib")
    scaler = joblib.load(f"/Users/noel_personal/Repos/TIKR/my-react-app/ml/models/{ticker}_scaler.joblib")

    # 1. Fetch recent data to predict for
    #    (Here, just as an example, let's fetch 5 days of data)
    recent_data = fetch_stock_data(ticker, "2023-01-01", "2023-01-31")

    # 2. Prepare data for prediction (matching the training logic)
    #    This depends on how your model was trained. 
    #    If your model needs a single row, or multiple rows, etc.
    #    For our minimal example, let's do the same single day shift trick:
    if len(recent_data) < 2:
        return {"error": "Not enough data for prediction."}

    # We'll take the second-to-last close to predict for the last close, etc.
    recent_data['Close_tomorrow'] = recent_data['Close'].shift(-1)
    recent_data.dropna(inplace=True)
    
    X_new = recent_data[['Close']].values
    X_new_scaled = scaler.transform(X_new)  # scale

    # 3. Predict
    predictions = model.predict(X_new_scaled)

    # 4. Return predictions in JSON-friendly format
    return {
        "stock_ticker": ticker,
        "predictions": predictions.tolist()
    }

@app.get("/")
def root():
    return {"message": "Stock Prediction API is up and running!"}
