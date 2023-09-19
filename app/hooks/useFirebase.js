"use client";

import React, { useState, createContext, useEffect, useContext } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  where,
} from "firebase/firestore";

import mapValues from "lodash.mapvalues";
import mergeWith from "lodash.mergewith";
import isArray from "lodash.isarray";
import debounce from "lodash.debounce";

const {
  useCollection: useCollectionHook,
  useCollectionOnce,
  useDocumentDataOnce,
  useDocumentData,
} = require("react-firebase-hooks/firestore");

const firebaseConfig = require("../firebaseConfig.json");

const FirebaseContext = createContext();
const FirestoreContext = createContext();
const FirebaseUserContext = createContext();

function getUserProperties(user) {
  if (!user) return null;

  const { uid, displayName, photoURL, email, phoneNumber, isAnonymous } = user;
  const { creationTime, lastSignInTime } = user.metadata;
  const userData = {
    uid,
    photoURL,
    email,
    emailLowercase: email?.toLowerCase(),
    emailDomain: email?.split("@")[1],
    isAnonymous,
  };

  // if(!userData.photoURL){
  //   userData.photoURL = `https://www.gravatar.com/avatar/${md5(email.toLowerCase().trim())}`
  // }

  if (displayName) userData.displayName = displayName;
  if (phoneNumber) userData.phoneNumber = phoneNumber;
  if (creationTime) userData.creationTime = new Date(creationTime);
  if (lastSignInTime) userData.lastSignInTime = new Date(lastSignInTime);

  return userData;
}

async function storeUser({ user, db, userDataKey }) {
  if (!user?.uid) return;
  const userRef = doc(db, "users", user[userDataKey]);

  const userData = getUserProperties(user);

  const storedUserData = mapDates((await getDoc(userRef)).data());
  // save a write if the user hasn't changed that much
  if (
    userData.displayName !== storedUserData.displayName ||
    userData.email !== storedUserData.email ||
    userData.photoURL !== storedUserData.photoURL ||
    Math.abs(storedUserData.lastSignInTime - userData.lastSignInTime) >
      1000 * 60 * 60
  ) {
    // console.info("✍🏻 writing to the user doc");
    // console.log({ userData, storedUserData });
    await setDoc(userRef, userData, { merge: true });
  }
  return { userRef, userData: storedUserData };
}

export function FirebaseProvider({ children, userDataKey = "uid" }) {
  console.log("RELOADING FIREBASE PROVIDER");
  const app = initializeApp(firebaseConfig);
  const db = getFirestore();
  const auth = getAuth();

  const [user, setUser] = useState(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      console.log("auth state changed");
      const userData = getUserProperties(user);
      setUser(userData || null);
      await storeUser({ user, db, userDataKey });
    });
  }, [db]);

  return (
    <FirebaseContext.Provider value={app}>
      <FirestoreContext.Provider value={db}>
        <FirebaseUserContext.Provider value={user}>
          {children}
        </FirebaseUserContext.Provider>
      </FirestoreContext.Provider>
    </FirebaseContext.Provider>
  );
}

export function useFirestore() {
  const context = React.useContext(FirestoreContext);
  if (context === undefined) {
    throw new Error("useFirestore must be used within a FirebaseProvider");
  }
  return context;
}

export function useFirebase() {
  const context = React.useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error("useFirebase must be used within a FirebaseProvider");
  }
  return context;
}

export function useAuth() {
  const auth = getAuth();
  const context = useContext(FirebaseUserContext);

  if (context === undefined) {
    throw new Error("No fb provider");
  }

  return {
    user: context,
    signInWithPopup: () => {
      const googleProvider = new GoogleAuthProvider();
      return signInWithPopup(auth, googleProvider);
    },
    signOut: () => signOut(auth),
    createUserWithEmailAndPassword: (email, password) => {
      return createUserWithEmailAndPassword(auth, email, password);
    },
    signInWithEmailAndPassword: (email, password) => {
      return signInWithEmailAndPassword(auth, email, password);
    },
  };
}

export function useCollection(collectionPath, options = { live: true }) {
  const db = getFirestore();

  const { user } = useAuth();

  let path = collectionPath;
  if (user && path[0] !== "/" && !options.group)
    path = `/users/${user.uid}/${path}`;

  let collectionRef;
  if (options.group) collectionRef = collectionGroup(db, path);
  else collectionRef = collection(db, path);

  const queryArgs = [collectionRef];

  if (options.orderBy)
    queryArgs.push(
      orderBy(options.orderBy, options.desc || options.dsc ? "desc" : "asc")
    );

  if (options.where) {
    // where can be an array of arrays or just an array
    // let's force it to be an array of arrays
    let whereClauses = options.where;
    if (!Array.isArray(options.where[0])) whereClauses = [options.where];

    whereClauses.forEach(([a, b, c]) => {
      queryArgs.push(where(a, b, c));
    });
  }

  if (options.limit) queryArgs.push(limit(options.limit));

  const [startAfterSnap, setStartAfterSnap] = useState(null);
  if (startAfterSnap) queryArgs.push(startAfter(startAfterSnap));

  let data = null,
    loading = null,
    error = null,
    snap = null;

  // only fetch the data if the limit isn't zero
  // this lets me just get the add function by passing limit=0
  // be careful not to ever change the limit to zero and back again D:

  if (options.limit !== 0) {
    // if(options.live)
    const useCollectionLiveOrNot =
      options.live === false ? useCollectionOnce : useCollectionHook;

    // console.log(options, queryArgs);

    [snap, loading, error] = useCollectionLiveOrNot(query(...queryArgs));
    // console.log({ snap, loading, error });
    if (snap?.docs) {
      // append instead of resetting if fetching more
      data = snap.docs.map((doc) => {
        return { ...mapDates(doc.data()), path: doc.ref.path, id: doc.id };
      });
    }
    if (error) {
      console.info("useCollection encountered an info with these options:");
      console.info({ collectionPath, options });
      console.error(error);
    }
  }

  function add(docData) {
    const data = {
      ...docData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (options.group) {
      return setDoc(doc(db, docData.path), data);
    } else return addDoc(collectionRef, data);
  }

  // TODO: merge properties here? It might already be happening? I might not need to do it with useDoc?
  const update = (docData) =>
    updateDocument(
      docData.path ? doc(db, docData.path) : doc(collectionRef, docData.id),
      docData
    );
  const remove = (docData) =>
    deleteDoc(
      docData.path ? doc(db, docData.path) : doc(collectionRef, docData.id)
    );

  // console.log({ path });
  // return [firebaseData, addDoc, loading, error];
  return { data, add, update, remove, loading, error };
}
const debouncedUpdate = debounce(
  (ref, data) => updateDocument(ref, data),
  1000
);

function mapDates(doc = {}) {
  return Object.fromEntries(
    Object.entries(doc).map(([k, v]) => {
      const value = typeof v?.toDate === "function" ? v.toDate() : v;
      return [k, value];
    })
  );
}

export function updateDocument(ref, data) {
  if (typeof ref === "string") ref = doc(getFirestore(), ref);

  // set fields to undefined to delete them
  const updatedFields = mapValues(data, (v) => {
    return v === undefined ? deleteField() : v;
  });
  const { id } = data;
  delete updatedFields.id;
  delete updatedFields.path;

  // console.log({ updatedFields, data });

  return setDoc(
    ref,
    {
      ...updatedFields,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export function useDoc(docPath, config = { live: true }) {
  let path = docPath; // || "/null/null";
  const db = useFirestore();
  const { user } = useAuth();
  if (user && path && path[0] !== "/") path = `/users/${user.uid}/${path}`;

  // use an empty string to get the current user's doc
  if (user && path === "") path = `/users/${user.uid}`;

  if (!path) path = "/";
  path = path.replace(/\/+/, "/");

  const docRef = doc(db, path);
  const [data, setData] = useState(null);

  // idField might not work anymore?
  // if you change live during a render bad things will happen lol.
  const useDocHook = config.live ? useDocumentData : useDocumentDataOnce;
  const [firebaseData, loading, error] = useDocHook(docRef, {
    idField: "id",
  });

  // update local data if remote data changes
  useEffect(() => {
    setData(
      firebaseData ? { ...mapDates(firebaseData), path, id: docRef.id } : null
    );
  }, [firebaseData, path]);

  const remove = () => deleteDoc(docRef);
  const update = (docData) => updateDocument(docRef, docData);

  function setDataWithFirebase(newData) {
    // console.info("setDataWithFirebase", newData);
    // I don't know why I have to spread merge, but setData doesn't update if I don't
    // this might not work with setting data to undefined?

    // without this customizer I can't update the order of an array
    // just using `merge` tries to merge the object values at the same
    // index of an array
    function customizer(objValue, srcValue) {
      if (isArray(objValue)) {
        return srcValue;
      }
    }
    setData({ ...mergeWith(data, newData, customizer) });
    debouncedUpdate(docRef, newData);
  }

  return {
    data,
    update,
    upsert: update,
    debouncedUpdate: setDataWithFirebase,
    // if you're fucking around with debounceUpdating nested data,
    // make sure you flush between each written key
    flushDebouncedUpdates: debouncedUpdate.flush,
    remove,
    loading,
    error,
  };
}
