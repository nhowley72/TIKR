import React, { useState, useEffect } from 'react';
import { 
  View, 
  StyleSheet, 
  Text, 
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import StockInput from '../components/StockInput';
import PredictionResults from '../components/PredictionResults';
import { getPrediction } from '../services/api';
import { testFirebaseConnection, checkFirebaseConfig, fetchUserData } from '../utils/firebaseTest';

export default function HomeScreen() {
  const [predictions, setPredictions] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentTicker, setCurrentTicker] = useState('');
  const [firebaseStatus, setFirebaseStatus] = useState(null);
  const [configStatus, setConfigStatus] = useState(null);
  const [userData, setUserData] = useState(null);
  const [userDataLoading, setUserDataLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // Check Firebase config on component mount
    const config = checkFirebaseConfig();
    setConfigStatus(config);
    
    // Fetch user data if user is logged in
    if (auth.currentUser) {
      handleFetchUserData();
    }
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const config = checkFirebaseConfig();
      setConfigStatus(config);
      
      if (auth.currentUser) {
        await handleFetchUserData();
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handlePrediction = async (ticker) => {
    setLoading(true);
    setError('');
    setCurrentTicker(ticker);
    
    try {
      const data = await getPrediction(ticker);
      setPredictions(data.predictions);
    } catch (err) {
      setError('Error fetching prediction');
      console.error('Error:', err);
      Alert.alert('Error', 'Failed to fetch prediction');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
      Alert.alert('Error', 'Failed to sign out');
    }
  };

  const handleTestFirebase = async () => {
    try {
      setFirebaseStatus({ testing: true });
      const result = await testFirebaseConnection();
      setFirebaseStatus(result);
      
      if (result.success) {
        Alert.alert('Success', 'Firebase connection is working properly!');
      } else {
        Alert.alert(
          'Connection Issues', 
          `Firebase connection test partially failed:\n\nAuth: ${result.details.auth.message}\n\nFirestore: ${result.details.firestore.message}`
        );
      }
    } catch (error) {
      console.error('Error testing Firebase:', error);
      setFirebaseStatus({ success: false, error: error.message });
      Alert.alert('Error', 'Failed to test Firebase connection');
    }
  };
  
  const handleFetchUserData = async () => {
    if (!auth.currentUser) {
      Alert.alert('Error', 'No user is currently logged in');
      return;
    }
    
    setUserDataLoading(true);
    try {
      const result = await fetchUserData(auth.currentUser.uid);
      
      if (result.success) {
        setUserData(result.data);
        return result.data;
      } else {
        console.warn('Failed to fetch user data:', result.message);
        if (result.error && result.error.includes('offline')) {
          Alert.alert(
            'Network Issue', 
            'Unable to fetch user data because the device appears to be offline. Please check your internet connection and try again.'
          );
        } else {
          Alert.alert('Error', result.message);
        }
        return null;
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      Alert.alert('Error', 'Failed to fetch user data');
      return null;
    } finally {
      setUserDataLoading(false);
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Not available';
    
    try {
      if (timestamp.seconds) {
        // Firestore Timestamp
        return new Date(timestamp.seconds * 1000).toLocaleString();
      } else if (timestamp.toDate) {
        // Firestore Timestamp object with toDate method
        return timestamp.toDate().toLocaleString();
      } else {
        // Regular date
        return new Date(timestamp).toLocaleString();
      }
    } catch (e) {
      console.error('Error formatting timestamp:', e);
      return 'Invalid date';
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView 
        contentContainerStyle={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.container}>
          <Text style={styles.title}>TIKR Stock Prediction</Text>
          
          {/* User Info Section */}
          <View style={styles.userInfoContainer}>
            <Text style={styles.userInfoTitle}>User Information</Text>
            <Text style={styles.userInfoText}>Email: {auth.currentUser?.email || 'Not available'}</Text>
            <Text style={styles.userInfoText}>User ID: {auth.currentUser?.uid || 'Not available'}</Text>
            
            {userDataLoading ? (
              <ActivityIndicator style={styles.loader} color="#007AFF" />
            ) : userData ? (
              <View style={styles.userDataContainer}>
                <Text style={styles.userInfoSubtitle}>Firestore User Data:</Text>
                <Text style={styles.userInfoText}>Subscription: {userData.is_subscribed ? 'Active' : 'Inactive'}</Text>
                {userData.subscription_level && (
                  <Text style={styles.userInfoText}>Level: {userData.subscription_level}</Text>
                )}
                {userData.subscription_end_date && (
                  <Text style={styles.userInfoText}>
                    Expires: {formatTimestamp(userData.subscription_end_date)}
                  </Text>
                )}
                {userData.stripeId && (
                  <Text style={styles.userInfoText}>Stripe ID: {userData.stripeId}</Text>
                )}
                {userData.created_at && (
                  <Text style={styles.userInfoText}>
                    Created: {formatTimestamp(userData.created_at)}
                  </Text>
                )}
                {userData.lastLoginAt && (
                  <Text style={styles.userInfoText}>
                    Last Login: {formatTimestamp(userData.lastLoginAt)}
                  </Text>
                )}
              </View>
            ) : (
              <Text style={styles.userInfoText}>No Firestore data available</Text>
            )}
            
            <TouchableOpacity 
              style={styles.fetchButton}
              onPress={handleFetchUserData}
              disabled={userDataLoading}
            >
              <Text style={styles.fetchButtonText}>
                {userDataLoading ? 'Loading...' : 'Refresh User Data'}
              </Text>
            </TouchableOpacity>
          </View>
          
          {/* Firebase Status Section */}
          {configStatus && (
            <View style={styles.statusContainer}>
              <Text style={styles.statusTitle}>Firebase Configuration</Text>
              <Text style={[
                styles.statusText, 
                {color: configStatus.success ? '#4CAF50' : '#F44336'}
              ]}>
                Status: {configStatus.success ? 'Valid' : 'Invalid'}
              </Text>
              {configStatus.details && (
                <View>
                  <Text style={styles.statusText}>Project ID: {configStatus.details.projectId}</Text>
                  <Text style={styles.statusText}>Auth Domain: {configStatus.details.authDomain}</Text>
                </View>
              )}
              {!configStatus.success && (
                <Text style={styles.errorText}>{configStatus.message}</Text>
              )}
              
              {firebaseStatus && firebaseStatus.testing && (
                <ActivityIndicator style={styles.loader} color="#007AFF" />
              )}
              
              {firebaseStatus && !firebaseStatus.testing && (
                <View style={styles.connectionStatusContainer}>
                  <Text style={styles.statusSubtitle}>Connection Test Results:</Text>
                  
                  <View style={styles.connectionItem}>
                    <Text style={styles.connectionLabel}>Authentication:</Text>
                    <Text style={[
                      styles.connectionStatus,
                      {color: firebaseStatus.details?.auth?.success ? '#4CAF50' : '#F44336'}
                    ]}>
                      {firebaseStatus.details?.auth?.success ? 'Connected' : 'Failed'}
                    </Text>
                  </View>
                  
                  <View style={styles.connectionItem}>
                    <Text style={styles.connectionLabel}>Firestore:</Text>
                    <Text style={[
                      styles.connectionStatus,
                      {color: firebaseStatus.details?.firestore?.success ? '#4CAF50' : '#F44336'}
                    ]}>
                      {firebaseStatus.details?.firestore?.success ? 'Connected' : 'Failed'}
                    </Text>
                  </View>
                  
                  {firebaseStatus.details?.firestore?.success && (
                    <Text style={styles.statusText}>
                      Users in database: {firebaseStatus.details?.firestore?.usersCount || 0}
                    </Text>
                  )}
                </View>
              )}
            </View>
          )}
          
          {/* Firebase Test Button */}
          <TouchableOpacity 
            style={styles.testButton}
            onPress={handleTestFirebase}
            disabled={firebaseStatus?.testing}
          >
            <Text style={styles.testButtonText}>
              {firebaseStatus?.testing ? 'Testing...' : 'Test Firebase Connection'}
            </Text>
          </TouchableOpacity>
          
          {/* Existing Components */}
          <StockInput onSubmit={handlePrediction} />
          <PredictionResults 
            predictions={predictions}
            error={error}
            loading={loading}
            ticker={currentTicker}
          />
          
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
  userInfoContainer: {
    width: '100%',
    backgroundColor: '#f5f5f5',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  userInfoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  userInfoSubtitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 5,
    color: '#333',
  },
  userInfoText: {
    fontSize: 14,
    color: '#555',
    marginBottom: 5,
  },
  userDataContainer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  statusContainer: {
    width: '100%',
    backgroundColor: '#f5f5f5',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  statusSubtitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 8,
    color: '#333',
  },
  statusText: {
    fontSize: 14,
    marginBottom: 5,
  },
  errorText: {
    fontSize: 14,
    color: '#F44336',
    marginTop: 5,
  },
  connectionStatusContainer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  connectionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  connectionLabel: {
    fontSize: 14,
    color: '#555',
    width: 100,
  },
  connectionStatus: {
    fontSize: 14,
    fontWeight: '500',
  },
  testButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 20,
  },
  testButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  fetchButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  fetchButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  loader: {
    marginVertical: 10,
  },
  signOutButton: {
    marginTop: 20,
    padding: 10,
  },
  signOutText: {
    color: '#007AFF',
    fontSize: 16,
  },
}); 