const functions = require("firebase-functions");
const { initializeApp } = require("firebase-admin/app");
const { onCall } = require("firebase-functions/v2/https");
const {
  onDocumentCreated,
  Change,
  FirestoreEvent,
  onDocumentUpdated,
} = require("firebase-functions/v2/firestore");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

exports.translateNewMessage = onDocumentCreated(
  `users/{uid}/sessions/{sessionId}/messages/{messageId}`,
  async (event) => {
    try {
      const snapshot = event.data;

      if (!snapshot) {
        console.log("no data in new message event");
        return;
      }

      const { uid, messageId, sessionId } = event.params;
      const { id } = snapshot;
      const { text } = snapshot.data();

      const sessionRef = db
        .collection("users")
        .doc(uid)
        .collection("sessions")
        .doc(sessionId);
      const sessionSnap = await sessionRef.get();
      const { sessionLanguages } = sessionSnap.data();

      translatedRef = db
        .collection("translations")
        .doc(`${uid}_${sessionId}_${messageId}`);

      const translationToAdd = {
        input: text,
        uid,
        messageId,
        sessionId,
        languages: sessionLanguages,
      };

      await translatedRef.set(translationToAdd);
      return translationToAdd;
    } catch (err) {
      console.error(err);
    }
  }
);

exports.updateMessageWithNewTranslation = onDocumentUpdated(
  `translations/{translationId}`,
  async (event) => {
    try {
      const { translationId } = event.params;
      console.log("translationId is ", translationId);
      const { uid, messageId, sessionId, translated } = event.data.after.data();
      console.log(
        "uid ",
        uid,
        " messageId ",
        messageId,
        "translated",
        translated
      );

      const messageDocRef = db
        .collection("users")
        .doc(uid)
        .collection("sessions")
        .doc(sessionId)
        .collection("messages")
        .doc(messageId);

      console.log("messageDocRef", messageDocRef);
      await messageDocRef
        .set({ translated }, { merge: true })
        .then(async () => {
          console.log("merge successful");
          const translationRef = db
            .collection("translations")
            .doc(translationId);
          await translationRef.delete();
        });

      return translated;
    } catch (err) {
      console.error(err);
    }
  }
);
