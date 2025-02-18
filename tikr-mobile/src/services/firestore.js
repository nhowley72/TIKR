import { getFirestore, doc, setDoc, serverTimestamp, arrayUnion, getDoc, collection, addDoc, query, where, getDocs, orderBy } from "firebase/firestore";
import { auth } from '../config/firebase';

const db = getFirestore();

export async function createUserDocument(userData) {
  try {
    const userId = userData.uid;
    await setDoc(doc(db, "users", userId), {
      user_id: userId,
      name: userData.displayName || '',
      email: userData.email,
      stripeCustomerId: '',
      subscriptionStatus: false,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
      predictions: [], // Array to store user's prediction history
      settings: {
        notifications: true,
        theme: 'light'
      }
    });
    console.log("User document created successfully!");
  } catch (error) {
    console.error("Error creating user document:", error);
    throw error;
  }
}

export async function updateUserLastLogin(userId) {
  try {
    await setDoc(doc(db, "users", userId), {
      lastLoginAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error("Error updating last login:", error);
  }
}

export async function addPredictionToHistory(userId, prediction) {
  try {
    const predictionsRef = collection(db, "users", userId, "predictions");
    
    // Convert the predictions array to a string
    const predictionString = prediction.predictions.join(',');
    
    // Create the prediction document with userId included
    await addDoc(predictionsRef, {
      userId: userId, // Add user ID to the prediction document
      ticker: prediction.ticker,
      predictionData: predictionString,
      timestamp: serverTimestamp(),
    });

    console.log("Prediction added to user history!");
  } catch (error) {
    console.error("Error adding prediction to history:", error);
    throw error;
  }
}

export async function getUserPredictions(userId) {
  try {
    const predictionsRef = collection(db, "users", userId, "predictions");
    const q = query(predictionsRef, orderBy("timestamp", "desc"));
    
    const querySnapshot = await getDocs(q);
    const predictions = [];
    
    querySnapshot.forEach((doc) => {
      // Convert the string back to array when retrieving
      const predictionData = doc.data().predictionData.split(',').map(Number);
      predictions.push({
        id: doc.id,
        ...doc.data(),
        predictions: predictionData // Convert back to array
      });
    });
    
    return predictions;
  } catch (error) {
    console.error("Error fetching user predictions:", error);
    throw error;
  }
} 