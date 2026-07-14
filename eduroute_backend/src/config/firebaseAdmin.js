const env = require('./env');

let admin = null;
let messagingInstance = null;

try {
    // Optional at runtime until the dependency is installed in the workspace.
    // The notification service will skip push delivery if the package is unavailable.
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    admin = require('firebase-admin');
} catch (error) {
    admin = null;
}

const getFirebaseCredential = () => {
    if (!env.firebaseProjectId || !env.firebaseClientEmail || !env.firebasePrivateKey) {
        return null;
    }

    return {
        projectId: env.firebaseProjectId,
        clientEmail: env.firebaseClientEmail,
        privateKey: String(env.firebasePrivateKey).replace(/\\n/g, '\n')
    };
};

const getFirebaseAdminStatus = () => ({
    configured: Boolean(admin && getFirebaseCredential()),
    projectId: env.firebaseProjectId || null,
    initialized: Boolean(admin && admin.apps.length > 0)
});

const initializeFirebaseAdmin = () => {
    if (!admin) {
        return null;
    }

    if (admin.apps.length > 0) {
        return admin.app();
    }

    const credential = getFirebaseCredential();
    if (!credential) {
        return null;
    }

    return admin.initializeApp({
        credential: admin.credential.cert(credential)
    });
};

const getFirebaseMessaging = () => {
    if (messagingInstance !== null) {
        return messagingInstance;
    }

    const app = initializeFirebaseAdmin();
    messagingInstance = app ? admin.messaging(app) : null;
    return messagingInstance;
};

module.exports = {
    admin,
    initializeFirebaseAdmin,
    getFirebaseMessaging,
    getFirebaseAdminStatus
};
