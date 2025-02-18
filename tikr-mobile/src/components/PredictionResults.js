import React from 'react';
import { 
  View, 
  Text, 
  ActivityIndicator, 
  StyleSheet 
} from 'react-native';

export default function PredictionResults({ predictions, error, loading }) {
  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007bff" />
        <Text style={styles.loadingText}>Fetching predictions...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!predictions) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Predictions</Text>
      <View style={styles.predictionsContainer}>
        {predictions.map((prediction, index) => {
          // Ensure prediction is a number and handle formatting
          const predictionValue = Number(prediction);
          return (
            <Text key={index} style={styles.prediction}>
              Day {index + 1}: ${isNaN(predictionValue) ? '0.00' : predictionValue.toFixed(2)}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
    fontSize: 16,
  },
  errorText: {
    color: '#dc3545',
    fontSize: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  predictionsContainer: {
    width: '100%',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 15,
  },
  prediction: {
    fontSize: 16,
    color: '#333',
    marginBottom: 8,
  },
}); 