import { auth, db } from '../config/firebase';
import { signInAnonymously, signOut } from 'firebase/auth';
import { collection, getDocs, doc, getDoc, query, limit } from 'firebase/firestore';

/**
 * Tests the Firebase connection by attempting to sign in anonymously
 * and fetch data from Firestore
 * @returns {Promise<Object>} Result of the test with status and message
 */
export const testFirebaseConnection = async () => {
  const results = {
    auth: { success: false, message: 'Not tested' },
    firestore: { success: false, message: 'Not tested' },
    users: []
  };
  
  try {
    // Test authentication
    try {
      const authResult = await signInAnonymously(auth);
      results.auth = { 
        success: true, 
        message: 'Connected successfully',
        uid: authResult.user.uid
      };
      console.log('Anonymous auth successful:', authResult.user.uid);
    } catch (authError) {
      results.auth = { 
        success: false, 
        message: `Authentication failed: ${authError.message}`,
        code: authError.code
      };
      console.error('Authentication test failed:', authError);
    }
    
    // Test Firestore connection
    try {
      // Use a query with limit to minimize data transfer
      const usersQuery = query(collection(db, 'users'), limit(3));
      const usersSnapshot = await getDocs(usersQuery);
      
      results.firestore = { 
        success: true, 
        message: 'Connected successfully',
        usersCount: usersSnapshot.size
      };
      
      console.log('Firestore connection successful, users count:', usersSnapshot.size);
      
      // Get a list of user emails (for testing purposes only)
      usersSnapshot.forEach(doc => {
        const userData = doc.data();
        results.users.push({
          id: doc.id,
          email: userData.email || 'No email',
          isSubscribed: userData.is_subscribed || false,
          stripeCustomerId: userData.stripeId || 'Not set'
        });
      });
    } catch (firestoreError) {
      results.firestore = { 
        success: false, 
        message: `Firestore connection failed: ${firestoreError.message}`,
        code: firestoreError.code
      };
      console.error('Firestore test failed:', firestoreError);
    }
    
    // Sign out the anonymous user if auth was successful
    if (results.auth.success) {
      try {
        await signOut(auth);
      } catch (signOutError) {
        console.warn('Error signing out anonymous user:', signOutError);
      }
    }
    
    return {
      success: results.auth.success && results.firestore.success,
      message: results.auth.success && results.firestore.success 
        ? 'Firebase connection test successful' 
        : 'Firebase connection test partially failed',
      details: results
    };
  } catch (error) {
    console.error('Firebase connection test failed:', error);
    return {
      success: false,
      message: 'Firebase connection test failed',
      error: error.message,
      code: error.code,
      details: results
    };
  }
};

/**
 * Fetches the current user's data from Firestore with retry logic
 * @param {string} userId - The user ID to fetch data for
 * @param {number} maxRetries - Maximum number of retry attempts
 * @returns {Promise<Object>} User data or error
 */
export const fetchUserData = async (userId, maxRetries = 3) => {
  if (!userId) {
    return {
      success: false,
      message: 'No user ID provided'
    };
  }
  
  let retries = 0;
  
  const attemptFetch = async () => {
    try {
      console.log(`Fetching user data for ${userId} (attempt ${retries + 1}/${maxRetries})`);
      const userDoc = await getDoc(doc(db, "users", userId));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        return {
          success: true,
          message: 'User data fetched successfully',
          data: userData
        };
      } else {
        console.warn(`User document does not exist for ID: ${userId}`);
        return {
          success: false,
          message: 'User document does not exist'
        };
      }
    } catch (error) {
      console.error(`Error fetching user data (attempt ${retries + 1}/${maxRetries}):`, error);
      
      if (retries < maxRetries - 1) {
        retries++;
        console.log(`Retrying in ${retries} seconds...`);
        await new Promise(resolve => setTimeout(resolve, retries * 1000));
        return attemptFetch();
      } else {
        console.error("Max retries reached. Failed to fetch user data.");
        return {
          success: false,
          message: 'Error fetching user data after multiple attempts',
          error: error.message,
          code: error.code
        };
      }
    }
  };
  
  return attemptFetch();
};

/**
 * Checks if the current Firebase configuration is valid
 * @returns {Object} Result with status and details about the configuration
 */
export const checkFirebaseConfig = () => {
  const { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId } = auth.app.options;
  
  const missingFields = [];
  if (!apiKey) missingFields.push('apiKey');
  if (!authDomain) missingFields.push('authDomain');
  if (!projectId) missingFields.push('projectId');
  if (!storageBucket) missingFields.push('storageBucket');
  if (!messagingSenderId) missingFields.push('messagingSenderId');
  if (!appId) missingFields.push('appId');
  
  return {
    success: missingFields.length === 0,
    message: missingFields.length === 0 
      ? 'Firebase configuration is valid' 
      : `Firebase configuration is missing: ${missingFields.join(', ')}`,
    config: {
      apiKey: apiKey ? '✓' : '✗',
      authDomain: authDomain ? '✓' : '✗',
      projectId: projectId ? '✓' : '✗',
      storageBucket: storageBucket ? '✓' : '✗',
      messagingSenderId: messagingSenderId ? '✓' : '✗',
      appId: appId ? '✓' : '✗',
    },
    details: {
      projectId,
      authDomain,
      storageBucket
    }
  };
}; 