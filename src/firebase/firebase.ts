import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, User } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDBJOCfM0agSsaD__MzCBErQKwIy6z2vfc",
  authDomain: "wall-chess-mobile.firebaseapp.com",
  projectId: "wall-chess-mobile",
  storageBucket: "wall-chess-mobile.firebasestorage.app",
  messagingSenderId: "1046213773882",
  appId: "1:1046213773882:web:871e6a09534ba953500303",
  measurementId: "G-2RDFRFX2DE",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export async function loginAnonymously(): Promise<User> {
  const credential = await signInAnonymously(auth);
  return credential.user;
}