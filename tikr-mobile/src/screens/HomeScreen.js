import React, { useState, useEffect } from 'react';
import { 
  View, 
  StyleSheet, 
  Text, 
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert
} from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import StockInput from '../components/StockInput';
import PredictionResults from '../components/PredictionResults';
import { getPrediction } from '../services/api';
import { addPredictionToHistory, getUserPredictions } from '../services/firestore';

export default function HomeScreen() {
  const [predictions, setPredictions] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentTicker, setCurrentTicker] = useState('');
  const [predictionHistory, setPredictionHistory] = useState([]);

  // Fetch user's prediction history when component mounts
  useEffect(() => {
    const fetchPredictionHistory = async () => {
      try {
        const history = await getUserPredictions(auth.currentUser.uid);
        setPredictionHistory(history);
      } catch (error) {
        console.error('Error fetching prediction history:', error);
      }
    };

    fetchPredictionHistory();
  }, []);

  const handlePrediction = async (ticker) => {
    setLoading(true);
    setError('');
    setCurrentTicker(ticker);
    
    try {
      const data = await getPrediction(ticker);
      setPredictions(data.predictions);

      // Store the prediction in Firebase
      await addPredictionToHistory(auth.currentUser.uid, {
        ticker: ticker,
        predictions: data.predictions
      });

      // Update local prediction history
      const updatedHistory = await getUserPredictions(auth.currentUser.uid);
      setPredictionHistory(updatedHistory);
    } catch (err) {
      setError('Error fetching prediction');
      console.error('Error:', err);
      Alert.alert('Error', 'Failed to fetch or store prediction');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      // Navigation will be handled automatically by the auth state change
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollView}>
        <View style={styles.container}>
          <Text style={styles.title}>TIKR Stock Prediction</Text>
          <StockInput onSubmit={handlePrediction} />
          <PredictionResults 
            predictions={predictions}
            error={error}
            loading={loading}
            ticker={currentTicker}
          />
          
          {/* Add Prediction History Section */}
          {predictionHistory.length > 0 && (
            <View style={styles.historyContainer}>
              <Text style={styles.historyTitle}>Previous Predictions</Text>
              {predictionHistory.map((pred, index) => (
                <View key={index} style={styles.historyItem}>
                  <Text style={styles.historyTicker}>{pred.ticker}</Text>
                  <Text style={styles.historyTimestamp}>
                    {new Date(pred.timestamp?.toDate()).toLocaleString()}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity 
            style={styles.signOutButton}
            onPress={handleSignOut}
          >
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollView: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  signOutButton: {
    marginTop: 20,
    padding: 10,
  },
  signOutText: {
    color: '#007AFF',
    fontSize: 16,
  },
  historyContainer: {
    width: '100%',
    marginTop: 20,
    padding: 15,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  historyTicker: {
    fontSize: 16,
    fontWeight: '500',
    color: '#007AFF',
  },
  historyTimestamp: {
    fontSize: 14,
    color: '#666',
  },
}); 