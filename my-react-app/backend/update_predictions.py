#!/usr/bin/env python3
"""
Firebase Prediction Update Script

This script updates stock predictions in Firebase. It's designed to be run as a cron job.
"""

import os
import sys
import json
import logging
import pandas as pd
import numpy as np
import joblib
import yfinance as yf
from datetime import datetime, timedelta
import firebase_admin
from firebase_admin import credentials, firestore

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger('prediction_updater')

# Path to the service account file
SERVICE_ACCOUNT_PATH = os.path.join(os.path.dirname(__file__), 'firebase-service-account.json')

# List of stock tickers to update
STOCK_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA']

# Flag to indicate if TensorFlow is available
TENSORFLOW_AVAILABLE = False
try:
    import tensorflow as tf
    TENSORFLOW_AVAILABLE = True
    logger.info("TensorFlow is available")
except ImportError:
    logger.warning("TensorFlow is not available, will use fallback prediction method")

def initialize_firebase():
    """Initialize Firebase Admin SDK with service account credentials."""
    try:
        # Check if service account file exists
        if not os.path.exists(SERVICE_ACCOUNT_PATH):
            logger.error(f"Service account file not found at {SERVICE_ACCOUNT_PATH}")
            raise FileNotFoundError(f"Service account file not found at {SERVICE_ACCOUNT_PATH}")
            
        # Check if already initialized
        if not firebase_admin._apps:
            cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
            firebase_admin.initialize_app(cred)
            logger.info("Firebase initialized successfully")
        return firestore.client()
    except Exception as e:
        logger.error(f"Failed to initialize Firebase: {e}")
        raise

def fetch_stock_data(ticker, days=30):
    """Fetch historical stock data for the given ticker."""
    try:
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        
        logger.info(f"Fetching data for {ticker} from {start_date.date()} to {end_date.date()}")
        data = yf.download(ticker, start=start_date, end=end_date)
        
        if data.empty:
            logger.warning(f"No data returned for {ticker}")
            return None
            
        logger.info(f"Successfully fetched {len(data)} days of data for {ticker}")
        return data
    except Exception as e:
        logger.error(f"Error fetching data for {ticker}: {e}")
        return None

def prepare_prediction_data(ticker, stock_data):
    """Prepare data for prediction."""
    try:
        # Calculate technical indicators
        df = stock_data.copy()
        
        # Calculate moving averages
        df['MA5'] = df['Close'].rolling(window=5).mean()
        df['MA10'] = df['Close'].rolling(window=10).mean()
        df['MA20'] = df['Close'].rolling(window=20).mean()
        
        # Calculate RSI (Relative Strength Index)
        delta = df['Close'].diff()
        gain = delta.where(delta > 0, 0).rolling(window=14).mean()
        loss = -delta.where(delta < 0, 0).rolling(window=14).mean()
        rs = gain / loss
        df['RSI'] = 100 - (100 / (1 + rs))
        
        # Calculate MACD (Moving Average Convergence Divergence)
        ema12 = df['Close'].ewm(span=12, adjust=False).mean()
        ema26 = df['Close'].ewm(span=26, adjust=False).mean()
        df['MACD'] = ema12 - ema26
        df['Signal_Line'] = df['MACD'].ewm(span=9, adjust=False).mean()
        
        # Calculate Bollinger Bands
        df['20d_std'] = df['Close'].rolling(window=20).std()
        df['Upper_Band'] = df['MA20'] + (df['20d_std'] * 2)
        df['Lower_Band'] = df['MA20'] - (df['20d_std'] * 2)
        
        # Calculate daily returns
        df['Daily_Return'] = df['Close'].pct_change()
        
        # Calculate volatility (standard deviation of returns)
        df['Volatility'] = df['Daily_Return'].rolling(window=20).std()
        
        # Drop NaN values
        df = df.dropna()
        
        # Ensure predicting_data directory exists
        predicting_data_dir = os.path.join(os.path.dirname(__file__), 'predicting_data')
        os.makedirs(predicting_data_dir, exist_ok=True)
        
        # Save to CSV for model prediction
        output_path = os.path.join(predicting_data_dir, f'{ticker}.csv')
        
        # Add ticker column
        df['Ticker'] = ticker
        
        # Reset index to get Date as a column
        df = df.reset_index()
        
        # Save to CSV
        df.to_csv(output_path, index=False)
        logger.info(f"Saved prediction data for {ticker} to {output_path}")
        
        return df
    except Exception as e:
        logger.error(f"Error preparing prediction data for {ticker}: {e}")
        return None

def run_fallback_prediction(ticker, data):
    """
    Run a simple fallback prediction when TensorFlow is not available.
    This uses a simple moving average approach.
    """
    try:
        # Convert Close column to numeric if it's not already
        if 'Close' in data.columns:
            data['Close'] = pd.to_numeric(data['Close'], errors='coerce')
        
        # Get the last 30 days of closing prices
        close_prices = data['Close'].values
        
        # Calculate the average daily change over the last 10 days
        # Make sure we have enough data
        if len(close_prices) < 11:
            # If we don't have enough data, use a simple percentage increase
            current_price = close_prices[-1]
            # Assume a 0.1% daily increase
            avg_daily_change = 0.001
        else:
            # Calculate the average daily change
            daily_changes = np.diff(close_prices[-11:]) / close_prices[-11:-1]
            avg_daily_change = np.mean(daily_changes)
        
        # Get the current price (last closing price)
        current_price = close_prices[-1]
        
        # Generate predictions for the next 5 days
        raw_predictions = []
        next_price = current_price
        for i in range(5):
            next_price = next_price * (1 + avg_daily_change)
            raw_predictions.append(float(next_price))
        
        # Calculate the average predicted price (all 5 days)
        predicted_price = np.mean(raw_predictions)
        
        # Calculate change percentage
        change = ((predicted_price - current_price) / current_price) * 100
        
        # Calculate confidence (simplified)
        # Lower confidence for the fallback method
        confidence = 0.5
        
        # Get company name
        try:
            ticker_info = yf.Ticker(ticker).info
            company_name = ticker_info.get('shortName', ticker)
        except:
            company_name = ticker
        
        # Create prediction object
        prediction = {
            'ticker': ticker,
            'name': company_name,
            'currentPrice': float(current_price),
            'predictedPrice': float(predicted_price),
            'change': float(change),
            'confidence': float(confidence),
            'rawPredictions': raw_predictions,
            'lastUpdated': datetime.now(),
            'method': 'fallback'
        }
        
        logger.info(f"Generated fallback prediction for {ticker}: current=${current_price:.2f}, predicted=${predicted_price:.2f}, change={change:.2f}%")
        return prediction
    except Exception as e:
        logger.error(f"Error running fallback prediction for {ticker}: {e}")
        return None

def run_prediction(ticker):
    """Run prediction for the given ticker."""
    try:
        # Load the prediction data
        data_path = os.path.join(os.path.dirname(__file__), 'predicting_data', f'{ticker}.csv')
        if not os.path.exists(data_path):
            logger.error(f"Prediction data not found for {ticker} at {data_path}")
            return None
            
        X_predict = pd.read_csv(data_path)
        
        # If TensorFlow is not available, use the fallback prediction method
        if not TENSORFLOW_AVAILABLE:
            logger.info(f"Using fallback prediction method for {ticker}")
            return run_fallback_prediction(ticker, X_predict)
        
        # Ensure live_models directory exists
        live_models_dir = os.path.join(os.path.dirname(__file__), 'live_models')
        os.makedirs(live_models_dir, exist_ok=True)
        
        # Load the model
        model_path = os.path.join(live_models_dir, f'{ticker}_model.joblib')
        if not os.path.exists(model_path):
            logger.error(f"Model not found for {ticker} at {model_path}")
            logger.info(f"Falling back to simple prediction method for {ticker}")
            return run_fallback_prediction(ticker, X_predict)
            
        model = joblib.load(model_path)
        logger.info(f"Loaded model for {ticker}")
        
        # Get the current price (last closing price)
        current_price = X_predict['Close'].iloc[-1]
        
        # Prepare data for prediction
        X_features = X_predict.drop(['Date', 'Ticker'], axis=1, errors='ignore')
        
        # Make prediction
        raw_predictions = model.predict(X_features).tolist()
        
        # Calculate the average predicted price (last 5 days)
        predicted_price = np.mean(raw_predictions[-5:])
        
        # Calculate change percentage
        change = ((predicted_price - current_price) / current_price) * 100
        
        # Calculate confidence (simplified)
        confidence = 0.75  # Default confidence
        
        # Get company name
        try:
            ticker_info = yf.Ticker(ticker).info
            company_name = ticker_info.get('shortName', ticker)
        except:
            company_name = ticker
        
        # Create prediction object
        prediction = {
            'ticker': ticker,
            'name': company_name,
            'currentPrice': float(current_price),
            'predictedPrice': float(predicted_price),
            'change': float(change),
            'confidence': float(confidence),
            'rawPredictions': raw_predictions,
            'lastUpdated': datetime.now(),
            'method': 'model'
        }
        
        logger.info(f"Generated prediction for {ticker}: current=${current_price:.2f}, predicted=${predicted_price:.2f}, change={change:.2f}%")
        return prediction
    except Exception as e:
        logger.error(f"Error running prediction for {ticker}: {e}")
        # Try the fallback method if the model-based prediction fails
        logger.info(f"Trying fallback prediction method for {ticker}")
        try:
            X_predict = pd.read_csv(data_path)
            return run_fallback_prediction(ticker, X_predict)
        except Exception as fallback_error:
            logger.error(f"Fallback prediction also failed for {ticker}: {fallback_error}")
            return None

def update_firebase_prediction(db, prediction):
    """Update prediction in Firebase."""
    try:
        if not prediction:
            return False
            
        ticker = prediction['ticker']
        
        # Convert datetime to Firestore timestamp
        if isinstance(prediction['lastUpdated'], datetime):
            # Use a string representation instead of Firestore.Timestamp
            prediction['lastUpdated'] = prediction['lastUpdated'].isoformat()
        
        # Remove SERVER_TIMESTAMP as it might not be available
        if 'storedAt' in prediction:
            del prediction['storedAt']
            # Add a timestamp string instead
            prediction['storedAt'] = datetime.now().isoformat()
        
        # Store in Firestore
        db.collection('predictions').document(ticker).set(prediction)
        logger.info(f"Updated prediction for {ticker} in Firebase")
        return True
    except Exception as e:
        logger.error(f"Error updating prediction for {ticker} in Firebase: {e}")
        return False

def main():
    """Main function to update all predictions."""
    try:
        logger.info("Starting prediction update process")
        
        # Initialize Firebase
        try:
            db = initialize_firebase()
        except Exception as e:
            logger.error(f"Failed to initialize Firebase, cannot continue: {e}")
            sys.exit(1)
        
        # Process each ticker
        success_count = 0
        for ticker in STOCK_TICKERS:
            try:
                logger.info(f"Processing {ticker}")
                
                # Fetch stock data
                stock_data = fetch_stock_data(ticker)
                if stock_data is None:
                    logger.warning(f"Skipping {ticker} due to data fetch failure")
                    continue
                
                # Prepare prediction data
                prepared_data = prepare_prediction_data(ticker, stock_data)
                if prepared_data is None:
                    logger.warning(f"Skipping {ticker} due to data preparation failure")
                    continue
                
                # Run prediction
                prediction = run_prediction(ticker)
                if prediction is None:
                    logger.warning(f"Skipping {ticker} due to prediction failure")
                    continue
                
                # Update Firebase
                if update_firebase_prediction(db, prediction):
                    success_count += 1
                
            except Exception as e:
                logger.error(f"Error processing {ticker}: {e}")
        
        logger.info(f"Prediction update completed. Updated {success_count}/{len(STOCK_TICKERS)} tickers.")
    except Exception as e:
        logger.error(f"Error in main function: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 