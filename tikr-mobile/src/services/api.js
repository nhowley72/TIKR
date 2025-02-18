import axios from 'axios';

const API_URL = 'https://tikr-ezii.onrender.com';

export const getPrediction = async (stockTicker) => {
  try {
    const response = await axios.post(`${API_URL}/predict`, {
      stock_ticker: stockTicker
    });
    return response.data;
  } catch (error) {
    throw new Error('Failed to fetch prediction');
  }
}; 