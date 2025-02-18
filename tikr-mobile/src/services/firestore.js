import { getFirestore, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth } from '../config/firebase';

const db = getFirestore();

export async function createUserDocument(userData) {
  try {
    const userId = userData.uid;
    await setDoc(doc(db, "users", userId), {
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