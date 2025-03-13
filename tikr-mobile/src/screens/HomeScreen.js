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
  Image,
  Modal
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
  const [predictionCategory, setPredictionCategory] = useState('all'); // 'all', 'trending', 'gainers', 'losers'
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid'
  const [selectedPrediction, setSelectedPrediction] = useState(null);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [selectedTimeframe, setSelectedTimeframe] = useState('7'); // '1', '7', '14', '30'
  const [itemTimeframes, setItemTimeframes] = useState({}); // Store timeframe selections for each ticker

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
    
    // Filter by category
    if (predictionCategory === 'trending') {
      // Sort by trading volume or popularity (for demo, using confidence as proxy)
      filtered = filtered.sort((a, b) => b.confidence - a.confidence);
    } else if (predictionCategory === 'gainers') {
      // Sort by highest predicted gains
      filtered = filtered.sort((a, b) => b.change - a.change);
    } else if (predictionCategory === 'losers') {
      // Sort by biggest predicted losses
      filtered = filtered.sort((a, b) => a.change - b.change);
    }
    
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
  }, [searchQuery, predictions, watchlistMode, watchlist, predictionCategory]);

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
    setSelectedPrediction(item);
    setDetailsModalVisible(true);
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
    
    // Get the timeframe for this item, default to 7d if not set
    const itemTimeframe = itemTimeframes[item.ticker] || '7';
    
    // Calculate prediction based on selected timeframe
    const predictedPrice = getPredictedPriceForTimeframe(item, itemTimeframe);
    const change = getChangeForTimeframe(item, itemTimeframe);
    const isPositive = change > 0;
    
    const confidenceLevel = item.confidence >= 0.8 ? 'High' : item.confidence >= 0.6 ? 'Medium' : 'Low';
    const confidenceColor = item.confidence >= 0.8 ? '#4CAF50' : item.confidence >= 0.6 ? '#FF9800' : '#F44336';
    const isInWatchlist = watchlist.includes(item.ticker);
    
    // Mock data for prediction accuracy history (in a real app, this would come from your backend)
    const accuracyHistory = item.accuracyHistory || {
      lastMonth: Math.random() * 30 + 70, // Random value between 70-100%
      overall: Math.random() * 20 + 75    // Random value between 75-95%
    };
    
    return (
      <TouchableOpacity 
        style={styles.predictionCard}
        onPress={() => {
          setSelectedTimeframe(itemTimeframe); // Set the modal timeframe to match the card
          handleViewPredictionDetails(item);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.predictionHeader}>
          <View style={styles.tickerContainer}>
            <Text style={styles.tickerSymbol}>{item.ticker}</Text>
            {item.name && <Text style={styles.companyName} numberOfLines={1}>{item.name}</Text>}
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity 
              style={styles.watchlistButton}
              onPress={() => handleToggleWatchlist(item.ticker)}
              hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
            >
              <Ionicons 
                name={isInWatchlist ? "star" : "star-outline"} 
                size={24} 
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
              {isPositive ? '↑' : '↓'} ${Math.abs(predictedPrice - item.currentPrice).toFixed(2)} ({Math.abs(change).toFixed(2)}%)
            </Text>
          </View>
        </View>
        
        {/* Timeframe selector for card view */}
        <View style={styles.cardTimeframeContainer}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cardTimeframeScrollContent}
          >
            {[1, 3, 7, 14, 30].map((day) => (
              <TouchableOpacity 
                key={day}
                style={[styles.cardTimeframeButton, itemTimeframe === day.toString() && styles.cardTimeframeButtonActive]}
                onPress={(e) => {
                  e.stopPropagation(); // Prevent triggering the card's onPress
                  updateItemTimeframe(item.ticker, day.toString());
                }}
              >
                <Text style={[styles.cardTimeframeButtonText, itemTimeframe === day.toString() && styles.cardTimeframeButtonTextActive]}>
                  {day}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        
        <View style={styles.predictionDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Predicted:</Text>
            <Text style={styles.detailValue}>${predictedPrice.toFixed(2)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Time Frame:</Text>
            <Text style={styles.detailValue}>
              Day {itemTimeframe}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Confidence:</Text>
            <View style={styles.confidenceContainer}>
              <View style={[styles.confidenceBar, {width: `${item.confidence * 100}%`, backgroundColor: confidenceColor}]} />
              <Text style={[styles.confidenceText, {color: confidenceColor}]}>{confidenceLevel} ({(item.confidence * 100).toFixed(0)}%)</Text>
            </View>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Accuracy:</Text>
            <View style={styles.accuracyContainer}>
              <View style={styles.accuracyItem}>
                <Text style={styles.accuracyLabel}>Last Month</Text>
                <Text style={[
                  styles.accuracyValue, 
                  {color: accuracyHistory.lastMonth >= 80 ? '#4CAF50' : accuracyHistory.lastMonth >= 70 ? '#FF9800' : '#F44336'}
                ]}>
                  {accuracyHistory.lastMonth.toFixed(1)}%
                </Text>
              </View>
              <View style={styles.accuracyItem}>
                <Text style={styles.accuracyLabel}>Overall</Text>
                <Text style={[
                  styles.accuracyValue,
                  {color: accuracyHistory.overall >= 80 ? '#4CAF50' : accuracyHistory.overall >= 70 ? '#FF9800' : '#F44336'}
                ]}>
                  {accuracyHistory.overall.toFixed(1)}%
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Updated:</Text>
            <Text style={styles.detailValue}>{formatTime(item.lastUpdated)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderGridItem = ({ item }) => {
    // Get the timeframe for this item, default to 7d if not set
    const itemTimeframe = itemTimeframes[item.ticker] || '7';
    
    // Calculate prediction based on selected timeframe
    const predictedPrice = getPredictedPriceForTimeframe(item, itemTimeframe);
    const change = getChangeForTimeframe(item, itemTimeframe);
    const isPositive = change > 0;
    
    const isInWatchlist = watchlist.includes(item.ticker);
    
    return (
      <TouchableOpacity 
        style={styles.gridCard}
        onPress={() => {
          setSelectedTimeframe(itemTimeframe); // Set the modal timeframe to match the grid item
          handleViewPredictionDetails(item);
        }}
        activeOpacity={0.7}
      >
        <View style={styles.gridHeader}>
          <Text style={styles.gridTickerSymbol}>{item.ticker}</Text>
          <TouchableOpacity 
            style={styles.gridWatchlistButton}
            onPress={() => handleToggleWatchlist(item.ticker)}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
          >
            <Ionicons 
              name={isInWatchlist ? "star" : "star-outline"} 
              size={18} 
              color={isInWatchlist ? "#FFD700" : "#666"} 
            />
          </TouchableOpacity>
        </View>
        
        <Text style={styles.gridPrice}>${item.currentPrice.toFixed(2)}</Text>
        
        <View style={styles.gridChangeContainer}>
          <Text style={[
            styles.gridChange, 
            {color: isPositive ? '#4CAF50' : '#F44336'}
          ]}>
            {isPositive ? '↑' : '↓'} {Math.abs(change).toFixed(2)}%
          </Text>
        </View>
        
        {/* Timeframe selector for grid view */}
        <View style={styles.gridTimeframeContainer}>
          {[1, 7, 30].map((day) => (
            <TouchableOpacity 
              key={day}
              style={[styles.gridTimeframeButton, itemTimeframe === day.toString() && styles.gridTimeframeButtonActive]}
              onPress={(e) => {
                e.stopPropagation();
                updateItemTimeframe(item.ticker, day.toString());
              }}
            >
              <Text style={[styles.gridTimeframeButtonText, itemTimeframe === day.toString() && styles.gridTimeframeButtonTextActive]}>
                {day}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        
        <View style={[
          styles.gridRecommendation, 
          {backgroundColor: isPositive ? '#4CAF50' : '#F44336'}
        ]}>
          <Text style={styles.gridRecommendationText}>
            {isPositive ? 'BUY' : 'SELL'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderProfileTab = () => (
    <View style={styles.profileContainer}>
      {userDataLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      ) : (
        <ScrollView 
          contentContainerStyle={styles.profileContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.profileHeader}>
            <View style={styles.profileAvatar}>
              <Ionicons name="person" size={40} color="#fff" />
            </View>
            <Text style={styles.profileName}>
              {userData?.displayName || 'TIKR User'}
            </Text>
            <Text style={styles.profileEmail}>
              {userData?.email || auth.currentUser?.email || 'No email available'}
            </Text>
          </View>
          
          <View style={styles.profileSection}>
            <Text style={styles.sectionTitle}>Account Information</Text>
            
            <View style={styles.profileCard}>
              <View style={styles.profileItem}>
                <Ionicons name="calendar-outline" size={22} color="#666" style={styles.profileItemIcon} />
                <View style={styles.profileItemContent}>
                  <Text style={styles.profileItemLabel}>Member Since</Text>
                  <Text style={styles.profileItemValue}>
                    {userData?.createdAt ? formatTimestamp(userData.createdAt) : 'Not available'}
                  </Text>
                </View>
              </View>
              
              <View style={styles.profileItem}>
                <Ionicons name="time-outline" size={22} color="#666" style={styles.profileItemIcon} />
                <View style={styles.profileItemContent}>
                  <Text style={styles.profileItemLabel}>Last Login</Text>
                  <Text style={styles.profileItemValue}>
                    {userData?.lastLogin ? formatTimestamp(userData.lastLogin) : 'Not available'}
                  </Text>
                </View>
              </View>
              
              <View style={styles.profileItem}>
                <Ionicons name="star-outline" size={22} color="#666" style={styles.profileItemIcon} />
                <View style={styles.profileItemContent}>
                  <Text style={styles.profileItemLabel}>Watchlist Items</Text>
                  <Text style={styles.profileItemValue}>{watchlist.length}</Text>
                </View>
              </View>
            </View>
          </View>
          
          <View style={styles.profileSection}>
            <Text style={styles.sectionTitle}>App Information</Text>
            
            <View style={styles.profileCard}>
              <View style={styles.profileItem}>
                <Ionicons name="information-circle-outline" size={22} color="#666" style={styles.profileItemIcon} />
                <View style={styles.profileItemContent}>
                  <Text style={styles.profileItemLabel}>Version</Text>
                  <Text style={styles.profileItemValue}>1.0.0</Text>
                </View>
              </View>
              
              <View style={styles.profileItem}>
                <Ionicons name="code-outline" size={22} color="#666" style={styles.profileItemIcon} />
                <View style={styles.profileItemContent}>
                  <Text style={styles.profileItemLabel}>Build</Text>
                  <Text style={styles.profileItemValue}>2023.1</Text>
                </View>
              </View>
            </View>
          </View>
          
          <TouchableOpacity 
            style={styles.signOutButton}
            onPress={handleSignOut}
          >
            <Ionicons name="log-out-outline" size={22} color="#fff" style={styles.signOutIcon} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );

  const renderPredictionsTab = () => {
    return (
      <View style={styles.predictionsContainer}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={22} color="#666" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search stocks..."
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
              // Filter predictions based on search query
              if (text.trim() === '') {
                setFilteredPredictions(predictions);
              } else {
                const filtered = predictions.filter(
                  item => 
                    item.ticker.toLowerCase().includes(text.toLowerCase()) ||
                    (item.name && item.name.toLowerCase().includes(text.toLowerCase()))
                );
                setFilteredPredictions(filtered);
              }
            }}
            placeholderTextColor="#999"
            clearButtonMode="while-editing"
          />
        </View>
        
        <View style={styles.topActionsContainer}>
          <View style={styles.filterContainer}>
            <TouchableOpacity 
              style={[styles.filterButton, !watchlistMode && styles.activeFilterButton]}
              onPress={() => setWatchlistMode(false)}
            >
              <Ionicons 
                name="list" 
                size={18} 
                color={!watchlistMode ? "#007AFF" : "#666"} 
                style={styles.filterIcon} 
              />
              <Text style={[styles.filterText, !watchlistMode && styles.activeFilterText]}>All</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.filterButton, watchlistMode && styles.activeFilterButton]}
              onPress={() => setWatchlistMode(true)}
            >
              <Ionicons 
                name="star" 
                size={18} 
                color={watchlistMode ? "#007AFF" : "#666"} 
                style={styles.filterIcon} 
              />
              <Text style={[styles.filterText, watchlistMode && styles.activeFilterText]}>Watchlist</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.viewToggleContainer}>
            <TouchableOpacity 
              style={[styles.viewToggleButton, viewMode === 'list' && styles.activeViewToggleButton]}
              onPress={() => setViewMode('list')}
            >
              <Ionicons 
                name="list" 
                size={20} 
                color={viewMode === 'list' ? "#007AFF" : "#666"} 
              />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.viewToggleButton, viewMode === 'grid' && styles.activeViewToggleButton]}
              onPress={() => setViewMode('grid')}
            >
              <Ionicons 
                name="grid" 
                size={20} 
                color={viewMode === 'grid' ? "#007AFF" : "#666"} 
              />
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.categoryContainer}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryScrollContent}
          >
            <TouchableOpacity 
              style={[styles.categoryButton, predictionCategory === 'all' && styles.activeCategoryButton]}
              onPress={() => setPredictionCategory('all')}
            >
              <Text style={[styles.categoryText, predictionCategory === 'all' && styles.activeCategoryText]}>
                All
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.categoryButton, predictionCategory === 'trending' && styles.activeCategoryButton]}
              onPress={() => setPredictionCategory('trending')}
            >
              <Ionicons 
                name="trending-up" 
                size={16} 
                color={predictionCategory === 'trending' ? "#007AFF" : "#666"} 
                style={styles.categoryIcon} 
              />
              <Text style={[styles.categoryText, predictionCategory === 'trending' && styles.activeCategoryText]}>
                Trending
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.categoryButton, predictionCategory === 'gainers' && styles.activeCategoryButton]}
              onPress={() => setPredictionCategory('gainers')}
            >
              <Ionicons 
                name="arrow-up" 
                size={16} 
                color={predictionCategory === 'gainers' ? "#4CAF50" : "#666"} 
                style={styles.categoryIcon} 
              />
              <Text style={[styles.categoryText, predictionCategory === 'gainers' && styles.activeCategoryText]}>
                Top Gainers
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.categoryButton, predictionCategory === 'losers' && styles.activeCategoryButton]}
              onPress={() => setPredictionCategory('losers')}
            >
              <Ionicons 
                name="arrow-down" 
                size={16} 
                color={predictionCategory === 'losers' ? "#F44336" : "#666"} 
                style={styles.categoryIcon} 
              />
              <Text style={[styles.categoryText, predictionCategory === 'losers' && styles.activeCategoryText]}>
                Top Losers
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
        
        <View style={styles.lastUpdatedContainer}>
          <View style={styles.lastUpdatedInfo}>
            <Text style={styles.lastUpdatedText}>
              Last updated: {lastUpdated.toLocaleString()}
            </Text>
            {isForceRefreshing && (
              <Text style={styles.refreshingText}>Refreshing predictions...</Text>
            )}
          </View>
          
          <TouchableOpacity 
            onPress={() => fetchPredictionsData(true)}
            disabled={isForceRefreshing}
            style={{opacity: isForceRefreshing ? 0.5 : 1}}
          >
            <Ionicons name="refresh" size={22} color="#007AFF" />
          </TouchableOpacity>
        </View>
        
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading predictions...</Text>
          </View>
        ) : filteredPredictions.length === 0 ? (
          <View style={styles.emptyContainer}>
            {watchlistMode ? (
              <>
                <Ionicons name="star-outline" size={64} color="#ccc" />
                <Text style={styles.emptyText}>Your watchlist is empty</Text>
                <Text style={styles.emptySubtext}>
                  Add stocks to your watchlist by tapping the star icon
                </Text>
              </>
            ) : searchQuery ? (
              <>
                <Ionicons name="search" size={64} color="#ccc" />
                <Text style={styles.emptyText}>No results found</Text>
                <Text style={styles.emptySubtext}>
                  Try a different search term
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="analytics-outline" size={64} color="#ccc" />
                <Text style={styles.emptyText}>No predictions available</Text>
                <Text style={styles.emptySubtext}>
                  Check back later for stock predictions
                </Text>
              </>
            )}
          </View>
        ) : (
          viewMode === 'list' ? (
            <FlatList
              data={filteredPredictions}
              renderItem={renderPredictionItem}
              keyExtractor={item => item.ticker}
              style={styles.predictionsList}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={['#007AFF']}
                  tintColor="#007AFF"
                />
              }
            />
          ) : (
            <FlatList
              data={filteredPredictions}
              renderItem={renderGridItem}
              keyExtractor={item => item.ticker}
              numColumns={2}
              columnWrapperStyle={styles.gridColumnWrapper}
              style={styles.predictionsGrid}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={['#007AFF']}
                  tintColor="#007AFF"
                />
              }
            />
          )
        )}
      </View>
    );
  };

  const renderPredictionDetailsModal = () => {
    if (!selectedPrediction) return null;
    
    const isPositive = getChangeForTimeframe(selectedPrediction, selectedTimeframe) > 0;
    const confidenceLevel = selectedPrediction.confidence >= 0.8 ? 'High' : selectedPrediction.confidence >= 0.6 ? 'Medium' : 'Low';
    const confidenceColor = selectedPrediction.confidence >= 0.8 ? '#4CAF50' : selectedPrediction.confidence >= 0.6 ? '#FF9800' : '#F44336';
    const isInWatchlist = watchlist.includes(selectedPrediction.ticker);
    
    // Calculate the predicted price and change for the selected timeframe
    const predictedPrice = getPredictedPriceForTimeframe(selectedPrediction, selectedTimeframe);
    const change = getChangeForTimeframe(selectedPrediction, selectedTimeframe);
    
    // Mock data for prediction accuracy history
    const accuracyHistory = selectedPrediction.accuracyHistory || {
      lastMonth: Math.random() * 30 + 70,
      overall: Math.random() * 20 + 75
    };
    
    return (
      <Modal
        animationType="slide"
        transparent={true}
        visible={detailsModalVisible}
        onRequestClose={() => setDetailsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <Text style={styles.modalTickerSymbol}>{selectedPrediction.ticker}</Text>
                {selectedPrediction.name && (
                  <Text style={styles.modalCompanyName}>{selectedPrediction.name}</Text>
                )}
              </View>
              
              <View style={styles.modalHeaderRight}>
                <TouchableOpacity 
                  style={styles.modalWatchlistButton}
                  onPress={() => handleToggleWatchlist(selectedPrediction.ticker)}
                >
                  <Ionicons 
                    name={isInWatchlist ? "star" : "star-outline"} 
                    size={28} 
                    color={isInWatchlist ? "#FFD700" : "#666"} 
                  />
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.modalCloseButton}
                  onPress={() => setDetailsModalVisible(false)}
                >
                  <Ionicons name="close" size={28} color="#333" />
                </TouchableOpacity>
              </View>
            </View>
            
            <ScrollView style={styles.modalBody}>
              <View style={styles.modalSection}>
                <View style={styles.modalPriceContainer}>
                  <Text style={styles.modalCurrentPrice}>${selectedPrediction.currentPrice.toFixed(2)}</Text>
                  <View style={[
                    styles.modalRecommendationBadge, 
                    {backgroundColor: isPositive ? '#4CAF50' : '#F44336'}
                  ]}>
                    <Text style={styles.modalRecommendationText}>
                      {isPositive ? 'BUY' : 'SELL'}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.modalPriceChangeContainer}>
                  <Text style={[
                    styles.modalPriceChange, 
                    {color: isPositive ? '#4CAF50' : '#F44336'}
                  ]}>
                    {isPositive ? '↑' : '↓'} ${Math.abs(predictedPrice - selectedPrediction.currentPrice).toFixed(2)} ({Math.abs(change).toFixed(2)}%)
                  </Text>
                </View>
              </View>
              
              {/* Timeframe Selector */}
              <View style={styles.timeframeContainer}>
                <Text style={styles.timeframeLabel}>Prediction Day:</Text>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.timeframeScrollContent}
                >
                  {[1, 3, 5, 7, 10, 14, 21, 30].map((day) => (
                    <TouchableOpacity 
                      key={day}
                      style={[styles.timeframeButton, selectedTimeframe === day.toString() && styles.timeframeButtonActive]}
                      onPress={() => setSelectedTimeframe(day.toString())}
                    >
                      <Text style={[styles.timeframeButtonText, selectedTimeframe === day.toString() && styles.timeframeButtonTextActive]}>
                        {day}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Prediction Details</Text>
                
                <View style={styles.modalDetailRow}>
                  <Text style={styles.modalDetailLabel}>Current Price:</Text>
                  <Text style={styles.modalDetailValue}>${selectedPrediction.currentPrice.toFixed(2)}</Text>
                </View>
                
                <View style={styles.modalDetailRow}>
                  <Text style={styles.modalDetailLabel}>Predicted Price:</Text>
                  <Text style={styles.modalDetailValue}>${predictedPrice.toFixed(2)}</Text>
                </View>
                
                <View style={styles.modalDetailRow}>
                  <Text style={styles.modalDetailLabel}>Timeframe:</Text>
                  <Text style={styles.modalDetailValue}>
                    Day {selectedTimeframe}
                  </Text>
                </View>
                
                <View style={styles.modalDetailRow}>
                  <Text style={styles.modalDetailLabel}>Confidence:</Text>
                  <View style={styles.modalConfidenceContainer}>
                    <View style={[styles.modalConfidenceBar, {width: `${selectedPrediction.confidence * 100}%`, backgroundColor: confidenceColor}]} />
                    <Text style={[styles.modalConfidenceText, {color: confidenceColor}]}>
                      {confidenceLevel} ({(selectedPrediction.confidence * 100).toFixed(0)}%)
                    </Text>
                  </View>
                </View>
                
                <View style={styles.modalDetailRow}>
                  <Text style={styles.modalDetailLabel}>Last Updated:</Text>
                  <Text style={styles.modalDetailValue}>{formatTimestamp(selectedPrediction.lastUpdated)}</Text>
                </View>
              </View>
              
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Prediction Accuracy</Text>
                
                <View style={styles.modalAccuracyContainer}>
                  <View style={styles.modalAccuracyItem}>
                    <Text style={styles.modalAccuracyValue}>
                      {accuracyHistory.lastMonth.toFixed(1)}%
                    </Text>
                    <Text style={styles.modalAccuracyLabel}>Last Month</Text>
                  </View>
                  
                  <View style={styles.modalAccuracyItem}>
                    <Text style={styles.modalAccuracyValue}>
                      {accuracyHistory.overall.toFixed(1)}%
                    </Text>
                    <Text style={styles.modalAccuracyLabel}>Overall</Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
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

  /**
   * Calculates the predicted price for a specific timeframe
   * @param {Object} prediction - The prediction object
   * @param {string} timeframe - The timeframe (day number as string: '1', '7', '14', '30')
   * @returns {number} The predicted price for the specified timeframe
   */
  const getPredictedPriceForTimeframe = (prediction, timeframe) => {
    if (!prediction) return 0;
    
    const currentPrice = prediction.currentPrice;
    
    // If no raw predictions available, return the default prediction
    if (!prediction.rawPredictions || prediction.rawPredictions.length === 0) {
      return prediction.predictedPrice || currentPrice;
    }
    
    // Convert timeframe to a number (day index)
    const day = parseInt(timeframe, 10);
    
    // If day is invalid, return the default prediction
    if (isNaN(day) || day < 1) {
      return prediction.predictedPrice;
    }
    
    // If we have the exact day in raw predictions, use it
    if (day <= prediction.rawPredictions.length) {
      return prediction.rawPredictions[day - 1];
    }
    
    // If requested day is beyond available predictions, return the last available prediction
    return prediction.rawPredictions[prediction.rawPredictions.length - 1];
  };

  /**
   * Calculates the percentage change for a specific timeframe
   * @param {Object} prediction - The prediction object
   * @param {string} timeframe - The timeframe ('1d', '5d', '7d', '30d')
   * @returns {number} The percentage change for the specified timeframe
   */
  const getChangeForTimeframe = (prediction, timeframe) => {
    if (!prediction) return 0;
    
    const currentPrice = prediction.currentPrice;
    const predictedPrice = getPredictedPriceForTimeframe(prediction, timeframe);
    
    return ((predictedPrice / currentPrice) - 1) * 100;
  };

  // Function to update the timeframe for a specific ticker
  const updateItemTimeframe = (ticker, timeframe) => {
    setItemTimeframes(prev => ({
      ...prev,
      [ticker]: timeframe
    }));
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
        {renderPredictionDetailsModal()}
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
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
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
    paddingVertical: 16,
    gap: 8,
  },
  activeTabButton: {
    borderBottomWidth: 3,
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 16,
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
    margin: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e1e4e8',
    height: 48,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontSize: 16,
  },
  topActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: 12,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginRight: 12,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    height: 36,
  },
  activeFilterButton: {
    backgroundColor: '#e6f2ff',
  },
  filterIcon: {
    marginRight: 6,
  },
  filterText: {
    fontSize: 14,
    color: '#666',
  },
  activeFilterText: {
    color: '#007AFF',
    fontWeight: '500',
  },
  viewToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 2,
  },
  viewToggleButton: {
    padding: 6,
    borderRadius: 6,
  },
  activeViewToggleButton: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  categoryContainer: {
    marginBottom: 8,
  },
  categoryScrollContent: {
    paddingHorizontal: 12,
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginRight: 10,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    height: 36,
  },
  activeCategoryButton: {
    backgroundColor: '#e6f2ff',
  },
  categoryIcon: {
    marginRight: 6,
  },
  categoryText: {
    fontSize: 14,
    color: '#666',
  },
  activeCategoryText: {
    color: '#007AFF',
    fontWeight: '500',
  },
  lastUpdatedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  lastUpdatedInfo: {
    flex: 1,
  },
  lastUpdatedText: {
    fontSize: 13,
    color: '#666',
  },
  refreshingText: {
    fontSize: 13,
    color: '#007AFF',
    fontStyle: 'italic',
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  predictionsList: {
    padding: 12,
    paddingBottom: 24,
  },
  predictionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  predictionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
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
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  watchlistButton: {
    padding: 8,
    marginRight: 8,
  },
  recommendationBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recommendationText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  currentPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginRight: 10,
  },
  priceChangeContainer: {
    flex: 1,
  },
  priceChange: {
    fontSize: 16,
    fontWeight: '500',
  },
  predictionDetails: {
    marginTop: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailLabel: {
    width: 90,
    fontSize: 14,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  confidenceContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 20,
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    overflow: 'hidden',
  },
  confidenceBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 10,
  },
  confidenceText: {
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 8,
    textShadowColor: 'rgba(255, 255, 255, 0.7)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    maxWidth: 250,
  },
  profileContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  profileContent: {
    padding: 16,
    paddingBottom: 40,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 24,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  profileName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: '#666',
  },
  profileSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  profileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  profileItemIcon: {
    marginRight: 12,
  },
  profileItemContent: {
    flex: 1,
  },
  profileItemLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  profileItemValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  signOutButton: {
    backgroundColor: '#F44336',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    flexDirection: 'row',
  },
  signOutIcon: {
    marginRight: 8,
  },
  signOutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '90%',
    paddingTop: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalHeaderLeft: {
    flex: 1,
  },
  modalHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTickerSymbol: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  modalCompanyName: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  modalWatchlistButton: {
    padding: 8,
    marginRight: 8,
  },
  modalCloseButton: {
    padding: 8,
  },
  modalBody: {
    flex: 1,
  },
  modalSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  modalPriceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalCurrentPrice: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
  },
  modalRecommendationBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modalRecommendationText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  modalPriceChangeContainer: {
    marginBottom: 8,
  },
  modalPriceChange: {
    fontSize: 18,
    fontWeight: '500',
  },
  modalDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalDetailLabel: {
    width: 150,
    fontSize: 16,
    color: '#666',
  },
  modalDetailValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  modalConfidenceContainer: {
    flex: 1,
    height: 24,
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalConfidenceBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 12,
  },
  modalConfidenceText: {
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 10,
    lineHeight: 24,
    textShadowColor: 'rgba(255, 255, 255, 0.7)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
  modalAccuracyContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
  },
  modalAccuracyItem: {
    alignItems: 'center',
  },
  modalAccuracyValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  modalAccuracyLabel: {
    fontSize: 14,
    color: '#666',
  },
  gridCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    width: '48%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  gridHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  gridTickerSymbol: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  gridWatchlistButton: {
    padding: 4,
  },
  gridPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  gridChangeContainer: {
    marginBottom: 8,
  },
  gridChange: {
    fontSize: 14,
    fontWeight: '500',
  },
  gridTimeframeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 8,
  },
  gridTimeframeButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    flex: 1,
    marginHorizontal: 2,
    alignItems: 'center',
  },
  gridTimeframeButtonActive: {
    backgroundColor: '#007AFF',
  },
  gridTimeframeButtonText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#666',
  },
  gridTimeframeButtonTextActive: {
    color: '#fff',
  },
  gridRecommendation: {
    paddingVertical: 4,
    borderRadius: 4,
    alignItems: 'center',
  },
  gridRecommendationText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  gridColumnWrapper: {
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  predictionsGrid: {
    paddingTop: 12,
    paddingBottom: 24,
  },
  accuracyContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  accuracyItem: {
    alignItems: 'center',
  },
  accuracyLabel: {
    fontSize: 12,
    color: '#666',
  },
  accuracyValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  timeframeContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  timeframeLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  timeframeScrollContent: {
    paddingHorizontal: 0,
  },
  timeframeButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    marginRight: 8,
    minWidth: 40,
    alignItems: 'center',
  },
  timeframeButtonActive: {
    backgroundColor: '#007AFF',
  },
  timeframeButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
  },
  timeframeButtonTextActive: {
    color: '#fff',
  },
  cardTimeframeContainer: {
    marginVertical: 12,
  },
  cardTimeframeScrollContent: {
    paddingHorizontal: 0,
  },
  cardTimeframeButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    marginRight: 8,
    minWidth: 40,
    alignItems: 'center',
  },
  cardTimeframeButtonActive: {
    backgroundColor: '#007AFF',
  },
  cardTimeframeButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
  },
  cardTimeframeButtonTextActive: {
    color: '#fff',
  },
}); 