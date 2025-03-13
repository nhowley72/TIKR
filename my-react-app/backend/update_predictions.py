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
STOCK_TICKERS = [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA',
    'JPM', 'V', 'WMT', 'DIS', 'NFLX', 'INTC', 'AMD', 'PYPL'
]

def initialize_firebase():
    """Initialize Firebase Admin SDK with service account credentials."""
    try:
        # Check if already initialized
        if not firebase_admin._apps:
            cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
            firebase_admin.initialize_app(cred)
            logger.info("Firebase initialized successfully")
        return firestore.client()
    except Exception as e:
        logger.error(f"Failed to initialize Firebase: {e}")
        raise

def fetch_stock_data(ticker, days=60):
    """
    Fetch historical stock data for the given ticker.
    
    Args:
        ticker: Stock ticker symbol
        days: Number of days of historical data to fetch (default: 60)
    
    Returns:
        DataFrame with historical stock data
    """
    try:
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        
        logger.info(f"Fetching data for {ticker} from {start_date.date()} to {end_date.date()}")
        
        # Try to fetch data with 1-minute intervals for the most recent day
        try:
            # Get intraday data for the most recent trading day
            intraday_data = yf.download(ticker, period="1d", interval="1m")
            logger.info(f"Successfully fetched {len(intraday_data)} minutes of intraday data for {ticker}")
        except Exception as e:
            logger.warning(f"Could not fetch intraday data for {ticker}: {e}")
            intraday_data = None
        
        # Get daily data for the historical period
        data = yf.download(ticker, start=start_date, end=end_date)
        
        if data.empty:
            logger.warning(f"No data returned for {ticker}")
            return None
            
        logger.info(f"Successfully fetched {len(data)} days of data for {ticker}")
        
        # Get additional market data
        try:
            # Get company info
            ticker_info = yf.Ticker(ticker).info
            market_cap = ticker_info.get('marketCap', None)
            sector = ticker_info.get('sector', None)
            industry = ticker_info.get('industry', None)
            
            # Add market cap as a feature if available
            if market_cap:
                data['MarketCap'] = market_cap
            
            logger.info(f"Added company info for {ticker}: Sector={sector}, Industry={industry}")
        except Exception as e:
            logger.warning(f"Could not fetch company info for {ticker}: {e}")
        
        # Try to get S&P 500 data for the same period for market comparison
        try:
            sp500 = yf.download('^GSPC', start=start_date, end=end_date)
            if not sp500.empty:
                # Calculate S&P 500 daily returns
                sp500['SP500_Return'] = sp500['Close'].pct_change()
                
                # Merge with stock data
                data['SP500_Close'] = sp500['Close']
                data['SP500_Return'] = sp500['SP500_Return']
                
                # Calculate beta (market correlation)
                if len(data) > 20:
                    data['Stock_Return'] = data['Close'].pct_change()
                    # Use rolling 20-day correlation
                    data['Beta'] = data['Stock_Return'].rolling(window=20).corr(data['SP500_Return'])
                
                logger.info(f"Added S&P 500 comparison data for {ticker}")
        except Exception as e:
            logger.warning(f"Could not fetch S&P 500 data: {e}")
        
        return data
    except Exception as e:
        logger.error(f"Error fetching data for {ticker}: {e}")
        return None

def prepare_prediction_data(ticker, stock_data):
    """
    Prepare data for prediction with enhanced feature engineering.
    
    Args:
        ticker: Stock ticker symbol
        stock_data: DataFrame with historical stock data
    
    Returns:
        DataFrame with features for prediction
    """
    try:
        # Make a copy of the data to avoid modifying the original
        df = stock_data.copy()
        
        # Basic features
        # Moving averages
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
        
        # Calculate daily returns
        df['Daily_Return'] = df['Close'].pct_change()
        
        # Calculate volatility (standard deviation of returns)
        df['Volatility'] = df['Daily_Return'].rolling(window=20).std()
        
        # Drop NaN values
        df = df.dropna()
        
        # Ensure predicting_data directory exists
        predicting_data_dir = os.path.join(os.path.dirname(__file__), 'predicting_data')
        os.makedirs(predicting_data_dir, exist_ok=True)
        
        # Add ticker column
        df['Ticker'] = ticker
        
        # Reset index to get Date as a column
        df = df.reset_index()
        
        # Save to CSV for model prediction
        output_path = os.path.join(predicting_data_dir, f'{ticker}.csv')
        df.to_csv(output_path, index=False)
        logger.info(f"Saved prediction data for {ticker} to {output_path}")
        
        return df
    except Exception as e:
        logger.error(f"Error preparing prediction data for {ticker}: {e}")
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
        
        # Check if TensorFlow is available
        tensorflow_available = False
        try:
            import tensorflow as tf
            tensorflow_available = True
            logger.info(f"TensorFlow is available, will use model-based prediction for {ticker}")
        except ImportError:
            logger.warning(f"TensorFlow is not available, will use fallback prediction for {ticker}")
        
        # If TensorFlow is not available, use the fallback prediction method
        if not tensorflow_available:
            logger.info(f"Using enhanced fallback prediction method for {ticker}")
            return run_fallback_prediction(ticker, X_predict)
        
        # Ensure live_models directory exists
        live_models_dir = os.path.join(os.path.dirname(__file__), 'live_models')
        os.makedirs(live_models_dir, exist_ok=True)
        
        # Load the model
        model_path = os.path.join(live_models_dir, f'{ticker}_model.joblib')
        if not os.path.exists(model_path):
            logger.error(f"Model not found for {ticker} at {model_path}")
            logger.info(f"Falling back to enhanced prediction method for {ticker}")
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
        
        # Convert datetime to string
        if isinstance(prediction['lastUpdated'], datetime):
            prediction['lastUpdated'] = prediction['lastUpdated'].isoformat()
        
        # Add a timestamp string
        prediction['storedAt'] = datetime.now().isoformat()
        
        # Store in Firestore
        db.collection('predictions').document(ticker).set(prediction)
        logger.info(f"Updated prediction for {ticker} in Firebase")
        return True
    except Exception as e:
        logger.error(f"Error updating prediction for {ticker} in Firebase: {e}")
        return False

def run_fallback_prediction(ticker, data):
    """
    Run an enhanced fallback prediction when TensorFlow is not available.
    This uses a combination of technical indicators for a more sophisticated prediction.
    
    Args:
        ticker: Stock ticker symbol
        data: DataFrame with prepared prediction data
    
    Returns:
        Dictionary with prediction results
    """
    try:
        # Convert Close column to numeric if it's not already
        if 'Close' in data.columns:
            data['Close'] = pd.to_numeric(data['Close'], errors='coerce')
        
        # Get the last 30 days of data
        recent_data = data.tail(30).copy()
        
        # Get the current price (last closing price)
        current_price = recent_data['Close'].iloc[-1]
        
        # Create a weighted prediction using multiple signals
        predictions = []
        weights = []
        
        # 1. Moving Average Trend Prediction
        # If price is above MA50, expect uptrend, otherwise downtrend
        if 'MA50' in recent_data.columns and not pd.isna(recent_data['MA50'].iloc[-1]):
            ma_trend = 1 if current_price > recent_data['MA50'].iloc[-1] else -1
            ma_distance = abs(current_price - recent_data['MA50'].iloc[-1]) / current_price
            ma_prediction = current_price * (1 + 0.01 * ma_trend * min(ma_distance * 100, 2))
            predictions.append(ma_prediction)
            weights.append(0.2)  # 20% weight
        
        # 2. RSI-based Prediction
        # RSI > 70: overbought, expect decline; RSI < 30: oversold, expect rise
        if 'RSI' in recent_data.columns and not pd.isna(recent_data['RSI'].iloc[-1]):
            rsi = recent_data['RSI'].iloc[-1]
            if rsi > 70:
                # Overbought - expect decline
                rsi_change = -0.01 * ((rsi - 70) / 30)
            elif rsi < 30:
                # Oversold - expect rise
                rsi_change = 0.01 * ((30 - rsi) / 30)
            else:
                # Neutral
                rsi_change = 0.0
            rsi_prediction = current_price * (1 + rsi_change)
            predictions.append(rsi_prediction)
            weights.append(0.15)  # 15% weight
        
        # 3. MACD-based Prediction
        if 'MACD' in recent_data.columns and 'Signal_Line' in recent_data.columns:
            if not pd.isna(recent_data['MACD'].iloc[-1]) and not pd.isna(recent_data['Signal_Line'].iloc[-1]):
                macd = recent_data['MACD'].iloc[-1]
                signal = recent_data['Signal_Line'].iloc[-1]
                
                # MACD crossing above signal line is bullish
                if macd > signal and recent_data['MACD'].iloc[-2] <= recent_data['Signal_Line'].iloc[-2]:
                    macd_change = 0.015  # Strong buy signal
                # MACD crossing below signal line is bearish
                elif macd < signal and recent_data['MACD'].iloc[-2] >= recent_data['Signal_Line'].iloc[-2]:
                    macd_change = -0.015  # Strong sell signal
                # MACD above signal line is bullish
                elif macd > signal:
                    macd_change = 0.005  # Buy signal
                # MACD below signal line is bearish
                else:
                    macd_change = -0.005  # Sell signal
                
                macd_prediction = current_price * (1 + macd_change)
                predictions.append(macd_prediction)
                weights.append(0.15)  # 15% weight
        
        # 4. Bollinger Band Position Prediction
        if 'BB_Position_20' in recent_data.columns and not pd.isna(recent_data['BB_Position_20'].iloc[-1]):
            bb_pos = recent_data['BB_Position_20'].iloc[-1]
            
            # Near lower band (0.0) - expect rise
            if bb_pos < 0.2:
                bb_change = 0.01 * (0.2 - bb_pos) / 0.2
            # Near upper band (1.0) - expect decline
            elif bb_pos > 0.8:
                bb_change = -0.01 * (bb_pos - 0.8) / 0.2
            # Middle of bands - neutral
            else:
                bb_change = 0.0
                
            bb_prediction = current_price * (1 + bb_change)
            predictions.append(bb_prediction)
            weights.append(0.15)  # 15% weight
        
        # 5. Historical Trend Prediction (simple moving average of returns)
        if len(recent_data) >= 10:
            # Calculate average daily change over the last 10 days
            daily_changes = recent_data['Daily_Return'].tail(10).mean()
            # Project forward 5 days
            trend_prediction = current_price * (1 + daily_changes * 5)
            predictions.append(trend_prediction)
            weights.append(0.2)  # 20% weight
        
        # 6. Volume Trend Prediction
        if 'Volume' in recent_data.columns and 'Volume_MA20' in recent_data.columns:
            if not pd.isna(recent_data['Volume'].iloc[-1]) and not pd.isna(recent_data['Volume_MA20'].iloc[-1]):
                vol_ratio = recent_data['Volume'].iloc[-1] / recent_data['Volume_MA20'].iloc[-1]
                
                # High volume often indicates trend continuation
                if vol_ratio > 1.5:
                    # High volume - amplify recent trend
                    recent_trend = recent_data['Close'].iloc[-1] / recent_data['Close'].iloc[-5] - 1
                    vol_change = recent_trend * 0.5  # Half of recent 5-day trend
                else:
                    vol_change = 0.0
                    
                vol_prediction = current_price * (1 + vol_change)
                predictions.append(vol_prediction)
                weights.append(0.15)  # 15% weight
        
        # If we don't have enough signals, use a simple percentage increase
        if not predictions:
            # Default to a 0.1% daily increase projected over 5 days
            predicted_price = current_price * (1 + 0.001 * 5)
            logger.info(f"Using default prediction for {ticker} due to insufficient signals")
        else:
            # Calculate weighted average prediction
            total_weight = sum(weights)
            predicted_price = sum(p * w for p, w in zip(predictions, weights)) / total_weight
            logger.info(f"Generated weighted prediction for {ticker} using {len(predictions)} signals")
        
        # Generate predictions for the next 5 days
        raw_predictions = []
        
        # If we have enough data, use a more sophisticated approach for daily predictions
        if len(predictions) >= 3:
            # Day 1: 20% of the way to final prediction
            raw_predictions.append(float(current_price + (predicted_price - current_price) * 0.2))
            # Day 2: 40% of the way to final prediction
            raw_predictions.append(float(current_price + (predicted_price - current_price) * 0.4))
            # Day 3: 60% of the way to final prediction
            raw_predictions.append(float(current_price + (predicted_price - current_price) * 0.6))
            # Day 4: 80% of the way to final prediction
            raw_predictions.append(float(current_price + (predicted_price - current_price) * 0.8))
            # Day 5: Final prediction
            raw_predictions.append(float(predicted_price))
        else:
            # Simple linear progression
            daily_change = (predicted_price - current_price) / 5
            for i in range(5):
                next_price = current_price + daily_change * (i + 1)
                raw_predictions.append(float(next_price))
        
        # Calculate change percentage
        change = ((predicted_price - current_price) / current_price) * 100
        
        # Calculate confidence based on signal agreement
        if len(predictions) >= 3:
            # Calculate standard deviation of predictions
            std_dev = np.std(predictions)
            # Lower standard deviation means higher confidence
            confidence_factor = 1 - min(std_dev / current_price / 0.05, 0.5)  # Cap at 0.5
            confidence = 0.5 + confidence_factor * 0.3  # Scale to 0.5-0.8 range
        else:
            confidence = 0.5  # Default confidence
        
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
            'method': 'enhanced_fallback',
            'signals': len(predictions)
        }
        
        logger.info(f"Generated enhanced fallback prediction for {ticker}: current=${current_price:.2f}, predicted=${predicted_price:.2f}, change={change:.2f}%, confidence={confidence:.2f}")
        return prediction
    except Exception as e:
        logger.error(f"Error running enhanced fallback prediction for {ticker}: {e}")
        # Try an extremely simple fallback if the enhanced method fails
        try:
            # Get the current price
            current_price = data['Close'].iloc[-1]
            # Assume a 0.1% daily increase over 5 days
            predicted_price = current_price * (1 + 0.001 * 5)
            change = 0.5  # 0.5% change
            
            # Create a basic prediction object
            prediction = {
                'ticker': ticker,
                'name': ticker,  # Use ticker as name
                'currentPrice': float(current_price),
                'predictedPrice': float(predicted_price),
                'change': float(change),
                'confidence': 0.3,  # Low confidence
                'rawPredictions': [float(current_price * (1 + 0.001 * i)) for i in range(1, 6)],
                'lastUpdated': datetime.now(),
                'method': 'simple_fallback'
            }
            
            logger.info(f"Generated simple fallback prediction for {ticker} after enhanced method failed")
            return prediction
        except Exception as e2:
            logger.error(f"Even simple fallback prediction failed for {ticker}: {e2}")
            return None

def main():
    """Main function to update all predictions."""
    try:
        current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        logger.info(f"Starting prediction update process at {current_time}")
        
        # Initialize Firebase
        db = initialize_firebase()
        
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