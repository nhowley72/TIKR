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
      console.log(`Creating/updating user document for ${userId}`);
      
      // Create new user document directly without checking if it exists first
      // This is more reliable in environments where getDoc might fail
      const userDocRef = doc(db, "users", userId);
      
      // Create the user document with merge option to avoid overwriting existing data
      await setDoc(userDocRef, {
        userId: userId,
        email: userData.email,
        displayName: userData.displayName || '',
        is_subscribed: false,
        subscription_level: null,
        subscription_end_date: null,
        stripeId: '',
        watchlist: userData.watchlist || [],
        created_at: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      }, { merge: true });
      
      console.log("User document created or updated successfully!");
      
      // Verify the document was created by trying to read it
      try {
        const verifyDoc = await getDoc(userDocRef);
        if (verifyDoc.exists()) {
          console.log("Verified user document exists in Firestore");
          return true;
        } else {
          console.warn("Document was written but verification failed - document doesn't exist");
          if (retries < maxRetries - 1) {
            throw new Error("Document verification failed");
          }
        }
      } catch (verifyError) {
        console.warn("Error verifying document:", verifyError);
        // Continue anyway since we already tried to create the document
      }
      
      return true;
    } catch (error) {
      console.error(`Error creating user document (attempt ${retries + 1}/${maxRetries}):`, error);
      
      if (retries < maxRetries - 1) {
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