# main.py
from fastapi import FastAPI
from pydantic import BaseModel
import joblib
import yfinance as yf
import numpy as np
import pandas as pd
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

    model = joblib.load(f"live_models/{ticker}_model.joblib")
    X_predict = pd.read_csv(f'predicting_data/{ticker}.csv')
    X_predict = X_predict.drop(['Date'], axis=1)
    X_predict = X_predict.drop(['Ticker'], axis=1)
    
    # Enable categorical parameter
    predictions = model.predict(X_predict)
    rounded_predictions = [np.round(pred, 2) for pred in predictions]

    # 4. Return predictions in JSON-friendly format
    return {
        "stock_ticker": ticker,
        "predictions": rounded_predictions
    }

@app.get("/")
def root():
    return {"message": "Stock Prediction API is up and running!"}
