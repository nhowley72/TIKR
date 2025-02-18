import React, { useState } from 'react';
import { 
  View, 
  TextInput, 
  TouchableOpacity, 
  Text, 
  StyleSheet 
} from 'react-native';

const VALID_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA'];

export default function StockInput({ onSubmit }) {
  const [ticker, setTicker] = useState('');

  const handleSubmit = () => {
    const formattedTicker = ticker.trim().toUpperCase();
    if (VALID_TICKERS.includes(formattedTicker)) {
      onSubmit(formattedTicker);
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={ticker}
        onChangeText={setTicker}
        placeholder="Enter stock ticker (e.g., AAPL)"
        placeholderTextColor="#666"
        autoCapitalize="characters"
        maxLength={5}
      />
      <TouchableOpacity 
        style={styles.button}
        onPress={handleSubmit}
      >
        <Text style={styles.buttonText}>Predict</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    width: '100%',
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  button: {
    backgroundColor: '#007bff',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
}); 