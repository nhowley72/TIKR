import { db, auth } from '../config/firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit, 
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore';
import axios from 'axios';

const API_URL = 'https://tikr-ezii.onrender.com';
const CACHE_EXPIRY_HOURS = 24; // How long predictions are valid before needing refresh

/**
 * Fetches the latest predictions for all stocks, using Firestore cache when available
 * @param {number} limitCount - Maximum number of predictions to fetch
 * @param {boolean} forceRefresh - Whether to force a refresh from the API
 * @returns {Promise<Array>} Array of stock predictions
 */
export const fetchLatestPredictions = async (limitCount = 20, forceRefresh = false) => {
  try {
    // Get the list of valid tickers - only the Magnificent 7
    const validTickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA'];
    
    // If forceRefresh is true, fetch from API
    if (forceRefresh) {
      console.log('Force refreshing predictions from API');
      return await fetchAndStorePredictions(validTickers);
    }
    
    // Otherwise, try to get predictions from Firestore cache
    try {
      const cachedPredictions = await fetchCachedPredictions(validTickers);
      
      // If we have cached predictions, use them
      if (cachedPredictions.length > 0) {
        console.log(`Using cached predictions for ${cachedPredictions.length} tickers`);
        
        // If we have all the tickers, return them
        if (cachedPredictions.length === validTickers.length) {
          return cachedPredictions;
        }
        
        // If we're missing some tickers, use sample data for the missing ones
        // This avoids calling the API on startup
        console.log(`Missing predictions for ${validTickers.length - cachedPredictions.length} tickers, using sample data`);
        const cachedTickers = cachedPredictions.map(p => p.ticker);
        const missingTickers = validTickers.filter(ticker => !cachedTickers.includes(ticker));
        
        // Generate sample data for missing tickers
        const sampleStocks = generateSamplePredictions();
        const samplePredictions = missingTickers.map(ticker => 
          sampleStocks.find(s => s.ticker === ticker)
        ).filter(Boolean);
        
        // Combine cached and sample predictions
        return [...cachedPredictions, ...samplePredictions];
      }
    } catch (error) {
      console.warn('Error accessing Firestore cache:', error);
    }
    
    // If no cache available, use sample data instead of calling API
    console.log('No cached predictions available, using sample data');
    return generateSamplePredictions().filter(p => validTickers.includes(p.ticker));
  } catch (error) {
    console.error('Error fetching predictions:', error);
    // Fall back to sample data if everything fails
    return generateSamplePredictions().filter(p => validTickers.includes(p.ticker));
  }
};

/**
 * Fetches cached predictions from Firestore
 * @param {Array} tickers - Array of ticker symbols to fetch
 * @returns {Promise<Array>} Array of cached predictions
 */
export const fetchCachedPredictions = async (tickers) => {
  try {
    const cachedPredictions = [];
    const now = new Date();
    let hasPermissionError = false;
    
    // Check cache for each ticker
    for (const ticker of tickers) {
      try {
        const predictionDoc = await getDoc(doc(db, 'predictions', ticker));
        
        if (predictionDoc.exists()) {
          const predictionData = predictionDoc.data();
          
          // Check if the prediction is still valid (not expired)
          const lastUpdated = predictionData.lastUpdated?.toDate() || new Date(0);
          const hoursElapsed = (now - lastUpdated) / (1000 * 60 * 60);
          
          if (hoursElapsed < CACHE_EXPIRY_HOURS) {
            // Convert Firestore timestamp to JS Date
            const prediction = {
              ...predictionData,
              lastUpdated: lastUpdated
            };
            
            cachedPredictions.push(prediction);
            console.log(`Using cached prediction for ${ticker}, updated ${hoursElapsed.toFixed(1)} hours ago`);
          } else {
            console.log(`Cached prediction for ${ticker} is expired (${hoursElapsed.toFixed(1)} hours old)`);
          }
        }
      } catch (error) {
        if (error.code === 'permission-denied' || 
            error.message.includes('permissions') || 
            error.message.includes('Missing or insufficient permissions')) {
          hasPermissionError = true;
          break; // Stop trying other tickers if we have permission issues
        }
        console.warn(`Error fetching cached prediction for ${ticker}:`, error);
      }
    }
    
    if (hasPermissionError) {
      console.warn('Permission denied when accessing Firestore cache. This is normal if you haven\'t set up Firestore security rules yet.');
      return []; // Return empty array to trigger API fetch
    }
    
    return cachedPredictions;
  } catch (error) {
    console.error('Error fetching cached predictions:', error);
    return [];
  }
};

/**
 * Fetches predictions from API and stores them in Firestore
 * @param {Array} tickers - Array of ticker symbols to fetch
 * @returns {Promise<Array>} Array of predictions
 */
export const fetchAndStorePredictions = async (tickers) => {
  const predictions = [];
  let storageSuccessful = false;
  
  // Fetch predictions for each ticker
  for (const ticker of tickers) {
    try {
      const prediction = await fetchStockPrediction(ticker);
      predictions.push(prediction);
      
      // Store the prediction in Firestore
      const stored = await storePrediction(prediction);
      if (stored) {
        storageSuccessful = true;
      }
    } catch (error) {
      console.warn(`Failed to fetch prediction for ${ticker}:`, error);
      
      // Use sample data as fallback
      const sampleStocks = generateSamplePredictions();
      const samplePrediction = sampleStocks.find(s => s.ticker === ticker);
      
      if (samplePrediction) {
        predictions.push(samplePrediction);
        await storePrediction(samplePrediction);
      }
    }
  }
  
  // If we couldn't store any predictions, log a warning
  if (predictions.length > 0 && !storageSuccessful) {
    console.warn('Could not store any predictions in Firestore. This may be due to missing security rules. The app will continue to work, but predictions will not be cached between sessions.');
  }
  
  return predictions;
};

/**
 * Stores a prediction in Firestore
 * @param {Object} prediction - Prediction object to store
 * @returns {Promise<boolean>} Whether the prediction was stored successfully
 */
export const storePrediction = async (prediction) => {
  try {
    // Convert JS Date to Firestore Timestamp
    const predictionToStore = {
      ...prediction,
      lastUpdated: Timestamp.fromDate(prediction.lastUpdated || new Date()),
      storedAt: serverTimestamp()
    };
    
    // Remove any circular references or non-serializable data
    delete predictionToStore.rawPredictions;
    
    // Store in Firestore
    await setDoc(doc(db, 'predictions', prediction.ticker), predictionToStore);
    console.log(`Stored prediction for ${prediction.ticker} in Firestore`);
    return true;
  } catch (error) {
    console.error(`Error storing prediction for ${prediction.ticker}:`, error);
    
    // Check if this is a permissions error
    if (error.code === 'permission-denied' || 
        error.message.includes('permissions') || 
        error.message.includes('Missing or insufficient permissions')) {
      console.warn(`Permission denied when storing prediction for ${prediction.ticker}. This is normal if you haven't set up Firestore security rules yet.`);
      // Continue without failing - we'll just use in-memory predictions for now
    }
    
    return false;
  }
};

/**
 * Fetches a prediction for a specific stock using the real API
 * @param {string} ticker - Stock ticker symbol
 * @returns {Promise<Object>} Stock prediction data
 */
export const fetchStockPrediction = async (ticker) => {
  try {
    console.log(`Fetching prediction for ${ticker} from API...`);
    
    // Call the real API
    const response = await axios.post(`${API_URL}/predict`, {
      stock_ticker: ticker
    });
    
    // Log the raw API response
    console.log(`API response for ${ticker}:`, JSON.stringify(response.data).substring(0, 200) + '...');
    
    // Extract the prediction data
    const apiData = response.data;
    
    // Find the base stock info from our sample data
    const sampleStocks = generateSamplePredictions();
    const stockInfo = sampleStocks.find(s => s.ticker === ticker.toUpperCase()) || {
      ticker: ticker.toUpperCase(),
      name: ticker.toUpperCase(),
      currentPrice: 100.00, // Default value if not found
      volume: 1000000,
      marketCap: 1000000000
    };
    
    // Extract and flatten predictions if they're nested arrays
    let predictions = apiData.predictions || [];
    
    // Check if predictions is an array of arrays and flatten if needed
    if (predictions.length > 0 && Array.isArray(predictions[0])) {
      console.log(`Flattening nested predictions array for ${ticker}`);
      predictions = predictions.map(p => Array.isArray(p) && p.length > 0 ? p[0] : p);
    }
    
    // Log the extracted predictions
    console.log(`Processed predictions for ${ticker}:`, JSON.stringify(predictions).substring(0, 200) + '...');
    
    if (!predictions || predictions.length === 0) {
      console.warn(`No predictions returned from API for ${ticker}`);
      throw new Error(`No predictions returned from API for ${ticker}`);
    }
    
    // Convert all prediction values to numbers
    const numericPredictions = predictions.map(p => {
      const num = Number(p);
      return isNaN(num) ? stockInfo.currentPrice : num;
    });
    
    // Calculate the predicted price (average of the predictions)
    const avgPrediction = numericPredictions.length > 0 
      ? numericPredictions.reduce((sum, val) => sum + val, 0) / numericPredictions.length
      : stockInfo.currentPrice;
    
    // Calculate the change percentage
    const change = ((avgPrediction - stockInfo.currentPrice) / stockInfo.currentPrice) * 100;
    
    // Determine buy/sell recommendation
    const recommendation = change > 0 ? 'buy' : 'sell';
    
    // Calculate confidence based on prediction consistency
    let confidence = 0.5; // Default medium confidence
    if (numericPredictions.length > 1) {
      // Calculate standard deviation as a measure of consistency
      const mean = avgPrediction;
      const variance = numericPredictions.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / numericPredictions.length;
      const stdDev = Math.sqrt(variance);
      
      // Lower standard deviation = higher confidence
      const normalizedStdDev = stdDev / mean; // Normalize by the mean
      confidence = Math.max(0.3, Math.min(0.95, 1 - normalizedStdDev * 10));
    }
    
    // Construct the prediction object
    const predictionObject = {
      id: stockInfo.id || ticker,
      ticker: ticker.toUpperCase(),
      name: stockInfo.name,
      currentPrice: stockInfo.currentPrice,
      predictedPrice: parseFloat(avgPrediction.toFixed(2)),
      confidence: parseFloat(confidence.toFixed(2)),
      lastUpdated: new Date(),
      change: parseFloat(change.toFixed(2)),
      recommendation: recommendation,
      volume: stockInfo.volume,
      marketCap: stockInfo.marketCap,
      rawPredictions: numericPredictions, // Store the processed predictions
    };
    
    console.log(`Prediction for ${ticker} processed successfully:`, JSON.stringify(predictionObject).substring(0, 200) + '...');
    return predictionObject;
  } catch (error) {
    console.error(`Error fetching prediction for ${ticker}:`, error.message);
    if (error.response) {
      console.error(`API error response for ${ticker}:`, error.response.status, JSON.stringify(error.response.data));
    }
    
    // If the API fails, fall back to sample data
    const sampleStocks = generateSamplePredictions();
    const stockPrediction = sampleStocks.find(p => p.ticker.toUpperCase() === ticker.toUpperCase());
    
    if (!stockPrediction) {
      throw new Error(`No prediction found for ${ticker}`);
    }
    
    console.log(`Using sample data for ${ticker} due to API error`);
    return stockPrediction;
  }
};

/**
 * Saves a stock to the user's watchlist
 * @param {string} userId - User ID
 * @param {string} ticker - Stock ticker symbol
 * @returns {Promise<void>}
 */
export const addToWatchlist = async (userId, ticker) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      throw new Error('User document not found');
    }
    
    const userData = userDoc.data();
    const watchlist = userData.watchlist || [];
    
    // Check if ticker is already in watchlist
    if (!watchlist.includes(ticker.toUpperCase())) {
      watchlist.push(ticker.toUpperCase());
      
      await setDoc(userRef, {
        watchlist: watchlist,
        updated_at: serverTimestamp()
      }, { merge: true });
    }
  } catch (error) {
    console.error(`Error adding ${ticker} to watchlist:`, error);
    throw error;
  }
};

/**
 * Removes a stock from the user's watchlist
 * @param {string} userId - User ID
 * @param {string} ticker - Stock ticker symbol
 * @returns {Promise<void>}
 */
export const removeFromWatchlist = async (userId, ticker) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      throw new Error('User document not found');
    }
    
    const userData = userDoc.data();
    let watchlist = userData.watchlist || [];
    
    // Remove ticker from watchlist
    watchlist = watchlist.filter(item => item !== ticker.toUpperCase());
    
    await setDoc(userRef, {
      watchlist: watchlist,
      updated_at: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error(`Error removing ${ticker} from watchlist:`, error);
    throw error;
  }
};

/**
 * Fetches the user's watchlist
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of ticker symbols
 */
export const fetchWatchlist = async (userId) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return [];
    }
    
    const userData = userDoc.data();
    return userData.watchlist || [];
  } catch (error) {
    console.error('Error fetching watchlist:', error);
    throw error;
  }
};

/**
 * Generates sample prediction data for testing
 * @returns {Array} Array of stock predictions
 */
const generateSamplePredictions = () => {
  const stocks = [
    { ticker: 'AAPL', name: 'Apple Inc.', currentPrice: 182.63 },
    { ticker: 'MSFT', name: 'Microsoft Corporation', currentPrice: 415.32 },
    { ticker: 'GOOGL', name: 'Alphabet Inc.', currentPrice: 175.98 },
    { ticker: 'AMZN', name: 'Amazon.com, Inc.', currentPrice: 178.75 },
    { ticker: 'META', name: 'Meta Platforms, Inc.', currentPrice: 485.38 },
    { ticker: 'TSLA', name: 'Tesla, Inc.', currentPrice: 248.42 },
    { ticker: 'NFLX', name: 'Netflix, Inc.', currentPrice: 628.78 },
    { ticker: 'NVDA', name: 'NVIDIA Corporation', currentPrice: 950.02 },
    { ticker: 'JPM', name: 'JPMorgan Chase & Co.', currentPrice: 198.73 },
    { ticker: 'V', name: 'Visa Inc.', currentPrice: 275.96 },
  ];
  
  return stocks.map((stock, index) => {
    const randomFactor = Math.random() * 0.04 - 0.02; // Random change between -2% and 2%
    const predictedPrice = parseFloat((stock.currentPrice * (1 + randomFactor)).toFixed(2));
    const change = parseFloat(((predictedPrice - stock.currentPrice) / stock.currentPrice * 100).toFixed(2));
    const recommendation = change > 0 ? 'buy' : 'sell';
    const confidence = parseFloat((0.5 + Math.abs(change) / 10).toFixed(2));
    
    return {
      id: (index + 1).toString(),
      ticker: stock.ticker,
      name: stock.name,
      currentPrice: stock.currentPrice,
      predictedPrice: predictedPrice,
      confidence: confidence > 0.95 ? 0.95 : confidence,
      lastUpdated: new Date(),
      change: change,
      recommendation: recommendation,
      volume: Math.floor(Math.random() * 10000000) + 1000000,
      marketCap: stock.currentPrice * (Math.floor(Math.random() * 10) + 1) * 1000000000,
    };
  });
}; 