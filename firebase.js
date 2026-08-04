// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCEFNMFPTKy7ZHutPkes_blz8ai-X6cVBk",
  authDomain: "kartenspiel-629e2.firebaseapp.com",
  projectId: "kartenspiel-629e2",
  storageBucket: "kartenspiel-629e2.firebasestorage.app",
  messagingSenderId: "862927128087",
  appId: "1:862927128087:web:34076e472e0a89226dfe52",
  measurementId: "G-C609JCEF25"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);