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
    
    // Try to get predictions from Firestore cache
    try {
      const cachedPredictions = await fetchCachedPredictions(validTickers);
      
      // If we have cached predictions, use them
      if (cachedPredictions.length > 0) {
        console.log(`Using cached predictions for ${cachedPredictions.length} tickers`);
        
        // If we have all the tickers, return them
        if (cachedPredictions.length === validTickers.length) {
          return cachedPredictions;
        }
        
        // If we're missing some tickers, fetch them from the API
        console.log(`Missing predictions for ${validTickers.length - cachedPredictions.length} tickers, fetching from API`);
        const cachedTickers = cachedPredictions.map(p => p.ticker);
        const missingTickers = validTickers.filter(ticker => !cachedTickers.includes(ticker));
        
        // Fetch missing tickers from API
        const apiPredictions = [];
        for (const ticker of missingTickers) {
          try {
            const prediction = await fetchStockPrediction(ticker);
            if (prediction) {
              apiPredictions.push(prediction);
              // Store in Firebase for future use
              await storePrediction(prediction);
            }
          } catch (error) {
            console.error(`Failed to fetch prediction for ${ticker} from API:`, error);
          }
        }
        
        // Combine cached and API predictions
        return [...cachedPredictions, ...apiPredictions];
      }
    } catch (error) {
      console.warn('Error accessing Firestore cache:', error);
    }
    
    // If no cache available, fetch all from API
    console.log('No cached predictions available, fetching all from API');
    return await fetchAndStorePredictions(validTickers);
  } catch (error) {
    console.error('Error fetching predictions:', error);
    // Return empty array instead of sample data
    return [];
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
          
          // Parse the lastUpdated timestamp - handle different formats
          let lastUpdated;
          if (predictionData.lastUpdated) {
            if (predictionData.lastUpdated.toDate) {
              // Firestore Timestamp object
              lastUpdated = predictionData.lastUpdated.toDate();
            } else if (typeof predictionData.lastUpdated === 'string') {
              // ISO string format
              lastUpdated = new Date(predictionData.lastUpdated);
            } else if (predictionData.lastUpdated.seconds) {
              // Firestore timestamp as object with seconds
              lastUpdated = new Date(predictionData.lastUpdated.seconds * 1000);
            } else {
              // Default to current date if format is unknown
              lastUpdated = new Date();
            }
          } else {
            lastUpdated = new Date(0); // Very old date to force refresh
          }
          
          // Check if the prediction is still valid (not expired)
          const hoursElapsed = (now - lastUpdated) / (1000 * 60 * 60);
          
          if (hoursElapsed < CACHE_EXPIRY_HOURS) {
            // Create a clean prediction object
            const prediction = {
              ...predictionData,
              lastUpdated: lastUpdated,
              // Ensure numeric values are properly typed
              currentPrice: parseFloat(predictionData.currentPrice),
              predictedPrice: parseFloat(predictionData.predictedPrice),
              change: parseFloat(predictionData.change),
              confidence: parseFloat(predictionData.confidence || 0.5)
            };
            
            cachedPredictions.push(prediction);
            console.log(`Using cached prediction for ${ticker}, updated ${hoursElapsed.toFixed(1)} hours ago`);
            console.log(`Current price from Firebase: $${prediction.currentPrice.toFixed(2)}`);
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
  const failedTickers = [];
  
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
      failedTickers.push(ticker);
    }
  }
  
  // If we couldn't store any predictions, log a warning
  if (predictions.length > 0 && !storageSuccessful) {
    console.warn('Could not store any predictions in Firestore. This may be due to missing security rules. The app will continue to work, but predictions will not be cached between sessions.');
  }
  
  // If we couldn't fetch any predictions, throw an error
  if (predictions.length === 0) {
    throw new Error(`Failed to fetch predictions for any tickers: ${failedTickers.join(', ')}`);
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
    // Create a clean copy of the prediction to store
    const predictionToStore = {
      ...prediction
    };
    
    // Convert JS Date to Firestore Timestamp if it's a Date object
    if (predictionToStore.lastUpdated instanceof Date) {
      predictionToStore.lastUpdated = Timestamp.fromDate(predictionToStore.lastUpdated);
    }
    
    // Add server timestamp
    predictionToStore.storedAt = serverTimestamp();
    
    // Remove any circular references or non-serializable data
    if (predictionToStore.rawPredictions) {
      // Ensure rawPredictions are all numbers
      predictionToStore.rawPredictions = predictionToStore.rawPredictions.map(p => 
        typeof p === 'number' ? p : parseFloat(p)
      );
    }
    
    // Ensure all numeric fields are actually numbers
    predictionToStore.currentPrice = parseFloat(predictionToStore.currentPrice);
    predictionToStore.predictedPrice = parseFloat(predictionToStore.predictedPrice);
    predictionToStore.change = parseFloat(predictionToStore.change);
    predictionToStore.confidence = parseFloat(predictionToStore.confidence || 0.5);
    
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
    
    // Get company name from API or use ticker as fallback
    const companyName = apiData.company_name || ticker.toUpperCase();
    
    // Get current price from API
    let currentPrice = 0;
    if (apiData.current_price) {
      currentPrice = parseFloat(apiData.current_price);
    } else if (apiData.stock_data && apiData.stock_data.current_price) {
      currentPrice = parseFloat(apiData.stock_data.current_price);
    } else {
      // Try to get the current price from the predictions
      const predictions = apiData.predictions || [];
      if (predictions.length > 0) {
        // Assume the first prediction is close to current price
        currentPrice = parseFloat(predictions[0]);
      } else {
        throw new Error(`No current price available for ${ticker}`);
      }
    }
    
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
      return isNaN(num) ? currentPrice : num;
    });
    
    // Calculate the predicted price (average of the predictions)
    const avgPrediction = numericPredictions.length > 0 
      ? numericPredictions.reduce((sum, val) => sum + val, 0) / numericPredictions.length
      : currentPrice;
    
    // Calculate the change percentage
    const change = ((avgPrediction - currentPrice) / currentPrice) * 100;
    
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
      id: ticker,
      ticker: ticker.toUpperCase(),
      name: companyName,
      currentPrice: parseFloat(currentPrice.toFixed(2)),
      predictedPrice: parseFloat(avgPrediction.toFixed(2)),
      confidence: parseFloat(confidence.toFixed(2)),
      lastUpdated: new Date(),
      change: parseFloat(change.toFixed(2)),
      recommendation: recommendation,
      volume: apiData.volume || 1000000,
      marketCap: apiData.market_cap || (currentPrice * 1000000000),
      rawPredictions: numericPredictions, // Store the processed predictions
    };
    
    console.log(`Prediction for ${ticker} processed successfully:`, JSON.stringify(predictionObject).substring(0, 200) + '...');
    return predictionObject;
  } catch (error) {
    console.error(`Error fetching prediction for ${ticker}:`, error.message);
    if (error.response) {
      console.error(`API error response for ${ticker}:`, error.response.status, JSON.stringify(error.response.data));
    }
    
    // Instead of falling back to sample data, throw the error
    throw new Error(`Failed to fetch prediction for ${ticker}: ${error.message}`);
  }
};

/**
 * Adds a stock to a user's watchlist
 * @param {string} userId - User ID
 * @param {string} ticker - Stock ticker symbol
 * @returns {Promise<boolean>} Whether the operation was successful
 */
export const addToWatchlist = async (userId, ticker) => {
  try {
    if (!userId) {
      console.warn('Cannot add to watchlist: No user ID provided');
      return false;
    }
    
    // Get the current watchlist
    const userDoc = await getDoc(doc(db, 'users', userId));
    
    if (!userDoc.exists()) {
      // Create the user document if it doesn't exist
      await setDoc(doc(db, 'users', userId), {
        watchlist: [ticker],
        createdAt: serverTimestamp()
      });
      return true;
    }
    
    // Get the current watchlist
    const userData = userDoc.data();
    const watchlist = userData.watchlist || [];
    
    // Check if the ticker is already in the watchlist
    if (watchlist.includes(ticker)) {
      console.log(`${ticker} is already in the watchlist`);
      return true;
    }
    
    // Add the ticker to the watchlist
    watchlist.push(ticker);
    
    // Update the user document
    await setDoc(doc(db, 'users', userId), {
      ...userData,
      watchlist: watchlist,
      updatedAt: serverTimestamp()
    });
    
    console.log(`Added ${ticker} to watchlist for user ${userId}`);
    return true;
  } catch (error) {
    console.error('Error adding to watchlist:', error);
    return false;
  }
};

/**
 * Removes a stock from a user's watchlist
 * @param {string} userId - User ID
 * @param {string} ticker - Stock ticker symbol
 * @returns {Promise<boolean>} Whether the operation was successful
 */
export const removeFromWatchlist = async (userId, ticker) => {
  try {
    if (!userId) {
      console.warn('Cannot remove from watchlist: No user ID provided');
      return false;
    }
    
    // Get the current watchlist
    const userDoc = await getDoc(doc(db, 'users', userId));
    
    if (!userDoc.exists()) {
      console.warn(`User document for ${userId} does not exist`);
      return false;
    }
    
    // Get the current watchlist
    const userData = userDoc.data();
    const watchlist = userData.watchlist || [];
    
    // Check if the ticker is in the watchlist
    if (!watchlist.includes(ticker)) {
      console.log(`${ticker} is not in the watchlist`);
      return true;
    }
    
    // Remove the ticker from the watchlist
    const newWatchlist = watchlist.filter(t => t !== ticker);
    
    // Update the user document
    await setDoc(doc(db, 'users', userId), {
      ...userData,
      watchlist: newWatchlist,
      updatedAt: serverTimestamp()
    });
    
    console.log(`Removed ${ticker} from watchlist for user ${userId}`);
    return true;
  } catch (error) {
    console.error('Error removing from watchlist:', error);
    return false;
  }
};

/**
 * Fetches a user's watchlist
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of ticker symbols
 */
export const fetchWatchlist = async (userId) => {
  try {
    if (!userId) {
      console.warn('Cannot fetch watchlist: No user ID provided');
      return [];
    }
    
    // Get the user document
    const userDoc = await getDoc(doc(db, 'users', userId));
    
    if (!userDoc.exists()) {
      console.log(`User document for ${userId} does not exist`);
      return [];
    }
    
    // Get the watchlist
    const userData = userDoc.data();
    return userData.watchlist || [];
  } catch (error) {
    console.error('Error fetching watchlist:', error);
    return [];
  }
};

/**
 * Generates sample prediction data for testing
 * @returns {Array} Array of stock predictions
 */
const generateSamplePredictions = () => {
  // Updated prices as of March 2025
  const stocks = [
    { ticker: 'AAPL', name: 'Apple Inc.', currentPrice: 239.07 },
    { ticker: 'MSFT', name: 'Microsoft Corporation', currentPrice: 393.31 },
    { ticker: 'GOOGL', name: 'Alphabet Inc.', currentPrice: 173.86 },
    { ticker: 'AMZN', name: 'Amazon.com, Inc.', currentPrice: 199.25 },
    { ticker: 'META', name: 'Meta Platforms, Inc.', currentPrice: 625.66 },
    { ticker: 'TSLA', name: 'Tesla, Inc.', currentPrice: 262.67 },
    { ticker: 'NFLX', name: 'Netflix, Inc.', currentPrice: 628.78 },
    { ticker: 'NVDA', name: 'NVIDIA Corporation', currentPrice: 112.69 },
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