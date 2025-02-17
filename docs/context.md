# Converting TIKR to Mobile App using Expo

## Overview
TIKR is a stock prediction application that uses machine learning to predict future stock prices for major tech companies (AAPL, MSFT, GOOGL, AMZN, META, NVDA, TSLA). The current implementation has:

1. A FastAPI backend hosted on Render
2. A React web frontend
3. ML models trained using TensorFlow/Keras

## Step-by-Step Mobile Implementation

### 1. Setup Expo Project

```bash
# Initialize new Expo project
npx create-expo-app tikr-mobile
cd tikr-mobile

# Install necessary dependencies
npm install axios @react-navigation/native @react-navigation/stack
npx expo install react-native-screens react-native-safe-area-context
```

### 2. Create App Structure

```plaintext
tikr-mobile/
├── src/
│   ├── screens/
│   │   ├── HomeScreen.js
│   │   └── PredictionScreen.js
│   ├── components/
│   │   ├── StockInput.js
│   │   └── PredictionResults.js
│   └── services/
│       └── api.js
└── App.js
```

### 3. API Integration
Create `src/services/api.js`:

```javascript
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
```

### 4. Create Main Components

#### HomeScreen.js
```javascript
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import StockInput from '../components/StockInput';
import PredictionResults from '../components/PredictionResults';
import { getPrediction } from '../services/api';

export default function HomeScreen() {
  const [predictions, setPredictions] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePrediction = async (ticker) => {
    setLoading(true);
    setError('');
    try {
      const data = await getPrediction(ticker);
      setPredictions(data.predictions);
    } catch (err) {
      setError('Error fetching prediction');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StockInput onSubmit={handlePrediction} />
      <PredictionResults 
        predictions={predictions}
        error={error}
        loading={loading}
      />
    </View>
  );
}
```

### 5. Backend Integration Notes

The mobile app will use the same FastAPI backend currently hosted at `tikr-ezii.onrender.com`. The API endpoint structure remains identical:

Reference to current API implementation:
```python:my-react-app/backend/main.py
startLine: 28
endLine: 47
```

### 6. Supported Stocks
Make sure to include validation for the supported stock tickers as shown in the current implementation:
```html:index.html
startLine: 78
endLine: 78
```

### 7. Testing & Deployment

1. Test locally:
```bash
npx expo start
```

2. Build for production:
```bash
eas build --platform ios
eas build --platform android
```

3. Submit to stores:
```bash
eas submit --platform ios
eas submit --platform android
```

## Important Considerations

1. **Error Handling**: Implement robust error handling for network issues and invalid inputs.

2. **Loading States**: Add loading indicators during API calls.

3. **Input Validation**: Validate stock tickers before making API calls.

4. **Offline Support**: Consider implementing offline caching for previous predictions.

5. **UI/UX**: Adapt the current web design to mobile-first principles:
   - Use native components
   - Implement touch-friendly interfaces
   - Consider different screen sizes
   - Add pull-to-refresh functionality

6. **Performance**: 
   - Implement request debouncing
   - Cache API responses
   - Optimize renders

The mobile app will maintain the same core functionality as the web version while providing a native mobile experience. The ML models and predictions will continue to be served from the existing Render-hosted backend.
