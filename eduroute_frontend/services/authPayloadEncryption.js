import { API_BASE_URL } from '../config';

let cachedPublicKey = null;

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return window.btoa(binary);
};

const pemToArrayBuffer = (pem) => {
  const base64 = String(pem || '')
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
};

const getAuthPayloadPublicKey = async () => {
  if (cachedPublicKey) return cachedPublicKey;

  const response = await fetch(`${API_BASE_URL}/api/auth/payload-public-key`, {
    cache: 'no-store',
  });
  const data = await response.json();

  if (!response.ok || !data?.data?.publicKey) {
    throw new Error(data?.message || 'Unable to load auth encryption key.');
  }

  cachedPublicKey = await window.crypto.subtle.importKey(
    'spki',
    pemToArrayBuffer(data.data.publicKey),
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    false,
    ['encrypt']
  );

  return cachedPublicKey;
};

export const encryptAuthPayload = async (payload) => {
  if (!window.crypto?.subtle) {
    throw new Error('Secure browser crypto is required for authentication.');
  }

  const publicKey = await getAuthPayloadPublicKey();
  const aesKey = await window.crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true,
    ['encrypt']
  );
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encodedPayload = new TextEncoder().encode(JSON.stringify(payload));
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      tagLength: 128,
    },
    aesKey,
    encodedPayload
  );
  const encryptedBytes = new Uint8Array(encryptedBuffer);
  const encryptedData = encryptedBytes.slice(0, encryptedBytes.length - 16);
  const authTag = encryptedBytes.slice(encryptedBytes.length - 16);
  const rawAesKey = await window.crypto.subtle.exportKey('raw', aesKey);
  const encryptedKey = await window.crypto.subtle.encrypt(
    {
      name: 'RSA-OAEP',
    },
    publicKey,
    rawAesKey
  );

  return {
    encryptedPayload: {
      encryptedData: arrayBufferToBase64(encryptedData),
      iv: arrayBufferToBase64(iv),
      authTag: arrayBufferToBase64(authTag),
      encryptedKey: arrayBufferToBase64(encryptedKey),
    },
  };
};

export const clearAuthPayloadPublicKeyCache = () => {
  cachedPublicKey = null;
};

export const encryptSensitivePayload = encryptAuthPayload;
