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
  RefreshControl,
  ToastAndroid,
  Platform,
  FlatList,
  TextInput,
  Image
} from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { testFirebaseConnection, checkFirebaseConfig, fetchUserData } from '../utils/firebaseTest';
import { createUserDocument } from '../services/firestore';
import { fetchLatestPredictions, addToWatchlist, removeFromWatchlist, fetchWatchlist } from '../services/predictions';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';

// Helper function to show toast messages on both platforms
const showToast = (message) => {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    // On iOS, we'll use Alert for now (in a real app, you'd use a custom toast component)
    Alert.alert('', message, [{ text: 'OK' }], { cancelable: true });
  }
};

export default function HomeScreen() {
  const [predictions, setPredictions] = useState([]);
  const [filteredPredictions, setFilteredPredictions] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userData, setUserData] = useState(null);
  const [userDataLoading, setUserDataLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('predictions'); // 'predictions' or 'profile'
  const [watchlist, setWatchlist] = useState([]);
  const [watchlistMode, setWatchlistMode] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isForceRefreshing, setIsForceRefreshing] = useState(false);

  const isFocused = useIsFocused();

  useEffect(() => {
    if (isFocused) {
      console.log('HomeScreen is focused, checking if data needs refresh');
      if (shouldRefreshPredictions()) {
        console.log('Data is stale, refreshing predictions');
        fetchPredictionsData(false);
      }
    }
  }, [isFocused]);

  useEffect(() => {
    // Initial data loading
    const loadInitialData = async () => {
      setLoading(true);
      try {
        // Fetch user data
        if (auth.currentUser) {
          await handleFetchUserData();
          
          // Fetch user's watchlist
          const userWatchlist = await fetchWatchlist(auth.currentUser.uid);
          setWatchlist(userWatchlist);
        }
        
        // Fetch predictions - never force refresh on startup
        await fetchPredictionsData(false);
      } catch (error) {
        console.error('Error loading initial data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadInitialData();
    
    // Removed automatic background refresh since predictions will be updated by a cron job
    
    // Clean up function (empty since we removed the interval)
    return () => {};
  }, []); // Empty dependency array since we don't need to re-run this effect
  
  // Filter predictions when search query or watchlist mode changes
  useEffect(() => {
    if (predictions.length === 0) return;
    
    let filtered = [...predictions];
    
    // Filter by watchlist if in watchlist mode
    if (watchlistMode && watchlist.length > 0) {
      filtered = filtered.filter(item => 
        watchlist.includes(item.ticker)
      );
    }
    
    // Filter by search query
    if (searchQuery.trim() !== '') {
      filtered = filtered.filter(item => 
        item.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.name && item.name.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }
    
    setFilteredPredictions(filtered);
  }, [searchQuery, predictions, watchlistMode, watchlist]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // Only refresh from Firebase cache, not API
      await fetchPredictionsData(false);
      
      if (auth.currentUser) {
        await handleFetchUserData();
        
        // Refresh watchlist
        const userWatchlist = await fetchWatchlist(auth.currentUser.uid);
        setWatchlist(userWatchlist);
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const fetchPredictionsData = async (forceRefresh = false) => {
    setLoading(true);
    if (forceRefresh) {
      setIsForceRefreshing(true);
    }
    
    try {
      // Get the list of valid tickers (either from your API or hardcoded)
      const validTickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA'];
      
      // If we're in watchlist mode and have a watchlist, use those tickers instead
      const tickersToFetch = watchlistMode && watchlist.length > 0 
        ? watchlist.filter(ticker => validTickers.includes(ticker))
        : validTickers;
      
      // Fetch predictions from Firebase or API
      console.log('Fetching predictions for tickers:', tickersToFetch);
      const data = await fetchLatestPredictions(20, forceRefresh);
      
      if (!data || data.length === 0) {
        console.warn('No predictions returned from fetchLatestPredictions');
        Alert.alert(
          'No Data Available', 
          'Could not retrieve stock predictions. Please check your internet connection and try again.',
          [{ text: 'OK' }]
        );
        return [];
      }
      
      console.log(`Received ${data.length} predictions from fetchLatestPredictions`);
      
      // Log the first prediction to verify data structure
      if (data.length > 0) {
        const applePrediction = data.find(p => p.ticker === 'AAPL');
        if (applePrediction) {
          console.log(`AAPL current price: $${applePrediction.currentPrice.toFixed(2)}`);
        }
      }
      
      // Update last updated timestamp
      setLastUpdated(new Date());
      
      // Update state with the fetched data
      setPredictions(data);
      console.log('Updated predictions state with new data');
      
      // Apply filters based on current search query and watchlist mode
      let filtered = [...data];
      
      // Filter by watchlist if in watchlist mode
      if (watchlistMode && watchlist.length > 0) {
        filtered = filtered.filter(item => 
          watchlist.includes(item.ticker)
        );
        console.log(`Filtered to ${filtered.length} watchlist items`);
      }
      
      // Filter by search query
      if (searchQuery.trim() !== '') {
        filtered = filtered.filter(item => 
          item.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (item.name && item.name.toLowerCase().includes(searchQuery.toLowerCase()))
        );
        console.log(`Filtered to ${filtered.length} items matching search: "${searchQuery}"`);
      }
      
      setFilteredPredictions(filtered);
      console.log(`Set filteredPredictions with ${filtered.length} items`);
      
      return data;
    } catch (error) {
      console.error('Error fetching predictions:', error);
      Alert.alert(
        'Error', 
        `Failed to fetch latest predictions: ${error.message}`,
        [{ text: 'OK' }]
      );
      return [];
    } finally {
      setLoading(false);
      if (forceRefresh) {
        setIsForceRefreshing(false);
      }
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
        
        // Show a message if the document was just created
        if (result.wasCreated) {
          showToast('User profile created successfully!');
        }
        
        return result.data;
      } else {
        // If the document doesn't exist, create it silently without showing an error
        if (result.message === 'User document does not exist') {
          console.log('User document does not exist, creating it now...');
          
          try {
            // Create the user document
            await createUserDocument({
              uid: auth.currentUser.uid,
              email: auth.currentUser.email,
              displayName: auth.currentUser.displayName || '',
              watchlist: []
            });
            
            // Try fetching again
            const newResult = await fetchUserData(auth.currentUser.uid);
            if (newResult.success) {
              setUserData(newResult.data);
              showToast('User profile created successfully!');
              return newResult.data;
            }
          } catch (createError) {
            console.error('Error creating user document:', createError);
          }
        } else {
          // For other errors, show the alert
          console.warn('Failed to fetch user data:', result.message);
          if (result.error && result.error.includes('offline')) {
            Alert.alert(
              'Network Issue', 
              'Unable to fetch user data because the device appears to be offline. Please check your internet connection and try again.'
            );
          } else {
            Alert.alert('Error', result.message);
          }
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

  const handleToggleWatchlist = async (ticker) => {
    if (!auth.currentUser) {
      Alert.alert('Sign In Required', 'Please sign in to add stocks to your watchlist');
      return;
    }
    
    try {
      const isInWatchlist = watchlist.includes(ticker);
      
      if (isInWatchlist) {
        // Remove from watchlist
        await removeFromWatchlist(auth.currentUser.uid, ticker);
        setWatchlist(prev => prev.filter(item => item !== ticker));
        showToast(`${ticker} removed from watchlist`);
      } else {
        // Add to watchlist
        await addToWatchlist(auth.currentUser.uid, ticker);
        setWatchlist(prev => [...prev, ticker]);
        showToast(`${ticker} added to watchlist`);
      }
    } catch (error) {
      console.error('Error updating watchlist:', error);
      Alert.alert('Error', 'Failed to update watchlist');
    }
  };

  const handleViewPredictionDetails = (item) => {
    // In a real app, you would navigate to a details screen
    // For now, we'll just show an alert with the prediction details
    
    let message = `Prediction for ${item.ticker} (${item.name})\n\n`;
    message += `Current Price: $${item.currentPrice.toFixed(2)}\n`;
    message += `Predicted Price: $${item.predictedPrice.toFixed(2)}\n`;
    message += `Change: ${item.change > 0 ? '+' : ''}${item.change.toFixed(2)}%\n`;
    message += `Confidence: ${(item.confidence * 100).toFixed(0)}%\n\n`;
    
    if (item.rawPredictions && item.rawPredictions.length > 0) {
      message += 'Daily Predictions:\n';
      item.rawPredictions.forEach((pred, index) => {
        const predValue = Number(pred);
        message += `Day ${index + 1}: $${isNaN(predValue) ? '0.00' : predValue.toFixed(2)}\n`;
      });
    }
    
    Alert.alert(
      `${item.ticker} Prediction Details`,
      message,
      [{ text: 'OK' }]
    );
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

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderPredictionItem = ({ item }) => {
    console.log(`Rendering prediction item for ${item.ticker}`);
    const isPositive = item.change > 0;
    const confidenceLevel = item.confidence >= 0.8 ? 'High' : item.confidence >= 0.6 ? 'Medium' : 'Low';
    const confidenceColor = item.confidence >= 0.8 ? '#4CAF50' : item.confidence >= 0.6 ? '#FF9800' : '#F44336';
    const isInWatchlist = watchlist.includes(item.ticker);
    
    return (
      <TouchableOpacity 
        style={styles.predictionCard}
        onPress={() => handleViewPredictionDetails(item)}
      >
        <View style={styles.predictionHeader}>
          <View style={styles.tickerContainer}>
            <Text style={styles.tickerSymbol}>{item.ticker}</Text>
            {item.name && <Text style={styles.companyName}>{item.name}</Text>}
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity 
              style={styles.watchlistButton}
              onPress={() => handleToggleWatchlist(item.ticker)}
            >
              <Ionicons 
                name={isInWatchlist ? "star" : "star-outline"} 
                size={22} 
                color={isInWatchlist ? "#FFD700" : "#666"} 
              />
            </TouchableOpacity>
            <View style={[
              styles.recommendationBadge, 
              {backgroundColor: isPositive ? '#4CAF50' : '#F44336'}
            ]}>
              <Text style={styles.recommendationText}>
                {isPositive ? 'BUY' : 'SELL'}
              </Text>
            </View>
          </View>
        </View>
        
        <View style={styles.priceContainer}>
          <Text style={styles.currentPrice}>${item.currentPrice.toFixed(2)}</Text>
          <View style={styles.priceChangeContainer}>
            <Text style={[
              styles.priceChange, 
              {color: isPositive ? '#4CAF50' : '#F44336'}
            ]}>
              {isPositive ? '↑' : '↓'} ${Math.abs(item.predictedPrice - item.currentPrice).toFixed(2)} ({Math.abs(item.change).toFixed(2)}%)
            </Text>
          </View>
        </View>
        
        <View style={styles.predictionDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Predicted:</Text>
            <Text style={styles.detailValue}>${item.predictedPrice.toFixed(2)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Confidence:</Text>
            <View style={styles.confidenceContainer}>
              <View style={[styles.confidenceBar, {width: `${item.confidence * 100}%`, backgroundColor: confidenceColor}]} />
              <Text style={[styles.confidenceText, {color: confidenceColor}]}>{confidenceLevel} ({(item.confidence * 100).toFixed(0)}%)</Text>
            </View>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Updated:</Text>
            <Text style={styles.detailValue}>{formatTime(item.lastUpdated)}</Text>
          </View>
        </View>
        
        {item.rawPredictions && item.rawPredictions.length > 0 && (
          <View style={styles.rawPredictionsContainer}>
            <Text style={styles.rawPredictionsTitle}>Next {item.rawPredictions.length} Days Forecast:</Text>
            <View style={styles.rawPredictionsChart}>
              {item.rawPredictions.map((pred, index) => {
                const predValue = Number(pred);
                const predChange = ((predValue - item.currentPrice) / item.currentPrice) * 100;
                const isPredPositive = predChange > 0;
                
                // Calculate bar height based on prediction value
                const minValue = Math.min(item.currentPrice, ...item.rawPredictions.map(p => Number(p)));
                const maxValue = Math.max(item.currentPrice, ...item.rawPredictions.map(p => Number(p)));
                const range = maxValue - minValue;
                const barHeight = range > 0 
                  ? ((predValue - minValue) / range) * 60 + 10 // Scale to 10-70px
                  : 35; // Default height if all values are the same
                
                return (
                  <View key={index} style={styles.dayPrediction}>
                    <Text style={styles.dayLabel}>Day {index + 1}</Text>
                    <View 
                      style={[
                        styles.predictionBar, 
                        {
                          height: barHeight,
                          backgroundColor: isPredPositive ? '#4CAF50' : '#F44336'
                        }
                      ]} 
                    />
                    <Text style={[
                      styles.dayChange,
                      {color: isPredPositive ? '#4CAF50' : '#F44336'}
                    ]}>
                      {isPredPositive ? '↑' : '↓'} {Math.abs(predChange).toFixed(1)}%
                    </Text>
                  </View>
                );
              })}
            </View>
            <View style={styles.rawPredictionsValues}>
              {item.rawPredictions.map((pred, index) => (
                <Text key={index} style={styles.predictionValue}>
                  ${Number(pred).toFixed(2)}
                </Text>
              ))}
            </View>
          </View>
        )}
        
        <View style={styles.cardFooter}>
          <Text style={styles.tapForMoreText}>Tap for more details</Text>
          <Ionicons name="chevron-forward" size={16} color="#666" />
        </View>
      </TouchableOpacity>
    );
  };

  const renderProfileTab = () => (
    <View style={styles.profileContainer}>
      <View style={styles.userInfoContainer}>
        <Text style={styles.userInfoTitle}>User Information</Text>
        <Text style={styles.userInfoText}>Email: {auth.currentUser?.email || 'Not available'}</Text>
        <Text style={styles.userInfoText}>User ID: {auth.currentUser?.uid || 'Not available'}</Text>
        
        {userDataLoading ? (
          <ActivityIndicator style={styles.loader} color="#007AFF" />
        ) : userData ? (
          <View style={styles.userDataContainer}>
            <Text style={styles.userInfoSubtitle}>Subscription Details:</Text>
            <Text style={styles.userInfoText}>Status: {userData.is_subscribed ? 'Active' : 'Inactive'}</Text>
            {userData.subscription_level && (
              <Text style={styles.userInfoText}>Level: {userData.subscription_level}</Text>
            )}
            {userData.subscription_end_date && (
              <Text style={styles.userInfoText}>
                Expires: {formatTimestamp(userData.subscription_end_date)}
              </Text>
            )}
            {userData.created_at && (
              <Text style={styles.userInfoText}>
                Account Created: {formatTimestamp(userData.created_at)}
              </Text>
            )}
            {userData.lastLoginAt && (
              <Text style={styles.userInfoText}>
                Last Login: {formatTimestamp(userData.lastLoginAt)}
              </Text>
            )}
            
            <Text style={styles.userInfoSubtitle}>Watchlist:</Text>
            {watchlist.length > 0 ? (
              <View style={styles.watchlistContainer}>
                {watchlist.map(ticker => (
                  <View key={ticker} style={styles.watchlistItem}>
                    <Text style={styles.watchlistTicker}>{ticker}</Text>
                    <TouchableOpacity 
                      onPress={() => handleToggleWatchlist(ticker)}
                      style={styles.removeButton}
                    >
                      <Ionicons name="close-circle" size={18} color="#F44336" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.userInfoText}>No stocks in watchlist</Text>
            )}
          </View>
        ) : (
          <View>
            <Text style={styles.userInfoText}>No subscription data available</Text>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={handleFetchUserData}
            >
              <Text style={styles.actionButtonText}>Refresh Profile</Text>
            </TouchableOpacity>
          </View>
        )}
        
        <TouchableOpacity 
          style={[styles.actionButton, styles.signOutButton]}
          onPress={handleSignOut}
        >
          <Text style={styles.actionButtonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderPredictionsTab = () => {
    console.log(`Rendering predictions tab with ${filteredPredictions.length} filtered predictions`);
    
    return (
      <View style={styles.predictionsContainer}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search stocks..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#666" />
            </TouchableOpacity>
          )}
        </View>
        
        <View style={styles.filterContainer}>
          <TouchableOpacity 
            style={[styles.filterButton, !watchlistMode && styles.activeFilterButton]}
            onPress={() => setWatchlistMode(false)}
          >
            <Text style={[styles.filterText, !watchlistMode && styles.activeFilterText]}>All Stocks</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.filterButton, watchlistMode && styles.activeFilterButton]}
            onPress={() => setWatchlistMode(true)}
          >
            <Ionicons 
              name="star" 
              size={16} 
              color={watchlistMode ? "#007AFF" : "#666"} 
              style={styles.filterIcon}
            />
            <Text style={[styles.filterText, watchlistMode && styles.activeFilterText]}>Watchlist</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.lastUpdatedContainer}>
          <View style={styles.lastUpdatedInfo}>
            <Text style={styles.lastUpdatedText}>
              Last updated: {formatTime(lastUpdated)}
            </Text>
            {isForceRefreshing && (
              <Text style={styles.refreshingText}>Refreshing from cache...</Text>
            )}
          </View>
          <View style={styles.refreshButtonContainer}>
            <TouchableOpacity 
              style={styles.refreshButton} 
              onPress={() => fetchPredictionsData(true)}
              disabled={isForceRefreshing}
            >
              <Text style={styles.refreshButtonText}>
                {isForceRefreshing ? 'Refreshing...' : 'Force Refresh'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        
        {loading && predictions.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading predictions...</Text>
          </View>
        ) : (
          <>
            {filteredPredictions.length > 0 ? (
              <FlatList
                data={filteredPredictions}
                renderItem={renderPredictionItem}
                keyExtractor={item => item.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.predictionsList}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>
                      {watchlistMode 
                        ? 'No stocks in your watchlist. Add some stocks to track them here.' 
                        : 'No stocks found matching your search.'}
                    </Text>
                  </View>
                }
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
              />
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  {watchlistMode 
                    ? 'No stocks in your watchlist. Add some stocks to track them here.' 
                    : predictions.length > 0 
                      ? 'No stocks found matching your search.' 
                      : 'No predictions available. Pull down to refresh.'}
                </Text>
              </View>
            )}
          </>
        )}
      </View>
    );
  };

  /**
   * Checks if predictions need to be refreshed based on their age
   * @returns {boolean} Whether predictions need to be refreshed
   */
  const shouldRefreshPredictions = () => {
    if (predictions.length === 0) return true;
    
    // Check how old the predictions are
    const now = new Date();
    const oldestPrediction = predictions.reduce((oldest, pred) => {
      const predDate = pred.lastUpdated instanceof Date ? pred.lastUpdated : new Date(pred.lastUpdated);
      const oldestDate = oldest instanceof Date ? oldest : new Date(oldest);
      return predDate < oldestDate ? predDate : oldestDate;
    }, now);
    
    // Convert to hours
    const hoursSinceUpdate = (now - oldestPrediction) / (1000 * 60 * 60);
    
    // Refresh if older than 1 hour
    return hoursSinceUpdate > 1;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>TIKR</Text>
          <Text style={styles.headerSubtitle}>Stock Predictions</Text>
        </View>
        
        <View style={styles.tabBar}>
          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'predictions' && styles.activeTabButton]} 
            onPress={() => setActiveTab('predictions')}
          >
            <Ionicons 
              name="trending-up" 
              size={20} 
              color={activeTab === 'predictions' ? '#007AFF' : '#666'} 
            />
            <Text style={[styles.tabText, activeTab === 'predictions' && styles.activeTabText]}>
              Predictions
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'profile' && styles.activeTabButton]} 
            onPress={() => setActiveTab('profile')}
          >
            <Ionicons 
              name="person" 
              size={20} 
              color={activeTab === 'profile' ? '#007AFF' : '#666'} 
            />
            <Text style={[styles.tabText, activeTab === 'profile' && styles.activeTabText]}>
              Profile
            </Text>
          </TouchableOpacity>
        </View>
        
        {activeTab === 'predictions' ? renderPredictionsTab() : renderProfileTab()}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  container: {
    flex: 1,
  },
  header: {
    backgroundColor: '#007AFF',
    padding: 15,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e4e8',
    backgroundColor: '#fff',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  activeTabButton: {
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
  },
  activeTabText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  predictionsContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e4e8',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 16,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    marginBottom: 5,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 10,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
  },
  activeFilterButton: {
    backgroundColor: '#e6f2ff',
  },
  filterIcon: {
    marginRight: 4,
  },
  filterText: {
    fontSize: 14,
    color: '#666',
  },
  activeFilterText: {
    color: '#007AFF',
    fontWeight: '500',
  },
  lastUpdatedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 8,
  },
  lastUpdatedInfo: {
    flex: 1,
  },
  lastUpdatedText: {
    fontSize: 12,
    color: '#666',
  },
  refreshingText: {
    fontSize: 12,
    color: '#007AFF',
    fontStyle: 'italic',
    marginTop: 2,
  },
  refreshButtonContainer: {
    alignItems: 'center',
    marginVertical: 10,
  },
  refreshButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 5,
  },
  refreshButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  predictionsList: {
    padding: 10,
    paddingBottom: 20,
  },
  predictionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  predictionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  tickerContainer: {
    flex: 1,
  },
  tickerSymbol: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  companyName: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  watchlistButton: {
    padding: 5,
    marginRight: 8,
  },
  recommendationBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  recommendationText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  priceContainer: {
    marginBottom: 15,
  },
  currentPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  priceChangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceChange: {
    fontSize: 14,
    fontWeight: '500',
  },
  predictionDetails: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  confidenceContainer: {
    flex: 1,
    marginLeft: 10,
  },
  confidenceBar: {
    height: 6,
    borderRadius: 3,
    marginBottom: 4,
  },
  confidenceText: {
    fontSize: 12,
    textAlign: 'right',
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  profileContainer: {
    flex: 1,
    padding: 15,
  },
  userInfoContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  userInfoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  userInfoSubtitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 15,
    marginBottom: 10,
    color: '#333',
  },
  userInfoText: {
    fontSize: 14,
    color: '#555',
    marginBottom: 8,
  },
  userDataContainer: {
    marginTop: 10,
  },
  watchlistContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 5,
  },
  watchlistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  watchlistTicker: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginRight: 5,
  },
  removeButton: {
    padding: 2,
  },
  actionButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 15,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  signOutButton: {
    backgroundColor: '#F44336',
    marginTop: 30,
  },
  loader: {
    marginVertical: 15,
  },
  rawPredictionsContainer: {
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  rawPredictionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
    color: '#333',
  },
  rawPredictionsChart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 80,
  },
  dayPrediction: {
    alignItems: 'center',
    flex: 1,
  },
  dayLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  dayValue: {
    fontSize: 12,
    fontWeight: '500',
  },
  dayChange: {
    fontSize: 10,
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 15,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  tapForMoreText: {
    fontSize: 12,
    color: '#666',
    marginRight: 5,
  },
  predictionBar: {
    width: 8,
    minHeight: 10,
    maxHeight: 70,
    borderRadius: 4,
    marginVertical: 4,
  },
  predictionValue: {
    fontSize: 10,
    color: '#333',
    textAlign: 'center',
    flex: 1,
  },
  rawPredictionsValues: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
  },
}); 