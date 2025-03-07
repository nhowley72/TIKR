import { getFirestore, doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { auth, db } from '../config/firebase';

/**
 * Creates a new user document in Firestore with retry logic
 * @param {Object} userData - User data from Firebase Auth
 * @param {number} maxRetries - Maximum number of retry attempts
 * @returns {Promise<void>}
 */
export async function createUserDocument(userData, maxRetries = 3) {
  let retries = 0;
  
  const attemptCreate = async () => {
    try {
      const userId = userData.uid;
      
      // Check if user document already exists
      const userDocRef = doc(db, "users", userId);
      
      try {
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          console.log("User document already exists, updating last login");
          await updateUserLastLogin(userId);
          return;
        }
      } catch (error) {
        console.warn("Error checking if user exists, will attempt to create anyway:", error.message);
      }
      
      // Create new user document
      await setDoc(userDocRef, {
        userId: userId,
        email: userData.email,
        displayName: userData.displayName || '',
        is_subscribed: false,
        subscription_level: null,
        subscription_end_date: null,
        stripeId: '',
        created_at: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });
      
      console.log("User document created successfully!");
    } catch (error) {
      console.error(`Error creating user document (attempt ${retries + 1}/${maxRetries}):`, error);
      
      if (retries < maxRetries) {
        retries++;
        console.log(`Retrying in ${retries * 2} seconds...`);
        await new Promise(resolve => setTimeout(resolve, retries * 2000));
        return attemptCreate();
      } else {
        console.error("Max retries reached. Failed to create user document.");
        throw error;
      }
    }
  };
  
  return attemptCreate();
}

/**
 * Updates the user's last login timestamp with retry logic
 * @param {string} userId - User ID
 * @param {number} maxRetries - Maximum number of retry attempts
 * @returns {Promise<void>}
 */
export async function updateUserLastLogin(userId, maxRetries = 3) {
  let retries = 0;
  
  const attemptUpdate = async () => {
    try {
      await setDoc(doc(db, "users", userId), {
        lastLoginAt: serverTimestamp()
      }, { merge: true });
      console.log("Last login timestamp updated");
    } catch (error) {
      console.error(`Error updating last login (attempt ${retries + 1}/${maxRetries}):`, error);
      
      if (retries < maxRetries) {
        retries++;
        console.log(`Retrying in ${retries} seconds...`);
        await new Promise(resolve => setTimeout(resolve, retries * 1000));
        return attemptUpdate();
      } else {
        console.error("Max retries reached. Failed to update last login.");
        // Don't throw error for last login updates as it's not critical
      }
    }
  };
  
  return attemptUpdate();
}

/**
 * Updates the user's subscription status with retry logic
 * @param {string} userId - User ID
 * @param {boolean} isSubscribed - Subscription status
 * @param {string} level - Subscription level
 * @param {Date} endDate - Subscription end date
 * @param {string} stripeId - Stripe customer ID
 * @param {number} maxRetries - Maximum number of retry attempts
 * @returns {Promise<void>}
 */
export async function updateUserSubscription(userId, isSubscribed, level, endDate, stripeId, maxRetries = 3) {
  let retries = 0;
  
  const attemptUpdate = async () => {
    try {
      const updateData = {
        is_subscribed: isSubscribed,
      };
      
      if (level) updateData.subscription_level = level;
      if (endDate) updateData.subscription_end_date = endDate;
      if (stripeId) updateData.stripeId = stripeId;
      
      await setDoc(doc(db, "users", userId), updateData, { merge: true });
      console.log("User subscription updated successfully");
    } catch (error) {
      console.error(`Error updating user subscription (attempt ${retries + 1}/${maxRetries}):`, error);
      
      if (retries < maxRetries) {
        retries++;
        console.log(`Retrying in ${retries * 2} seconds...`);
        await new Promise(resolve => setTimeout(resolve, retries * 2000));
        return attemptUpdate();
      } else {
        console.error("Max retries reached. Failed to update user subscription.");
        throw error;
      }
    }
  };
  
  return attemptUpdate();
} 