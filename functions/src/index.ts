import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

// HTTP endpoint example: create a checkout session
export const createCheckoutSession = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "You must be logged in to make a purchase."
      );
    }

    const { photoId } = data;
    if (!photoId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "photoId is required."
      );
    }

    // TODO: Integrate with PayPal SDK or Ecwid
    // For now, return a placeholder
    return {
      sessionId: `session_${Date.now()}`,
      status: "pending",
    };
  }
);