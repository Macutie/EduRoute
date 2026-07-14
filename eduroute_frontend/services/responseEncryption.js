let responseKeyPair = null;
let responsePublicKeyHeader = '';
let responseKeyPairPromise = null;

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return window.btoa(binary);
};

const base64ToArrayBuffer = (value) => {
  const binary = window.atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
};

const getResponseKeyPair = async () => {
  if (responseKeyPair && responsePublicKeyHeader) {
    return { keyPair: responseKeyPair, publicKeyHeader: responsePublicKeyHeader };
  }

  if (responseKeyPairPromise) {
    return responseKeyPairPromise;
  }

  if (!window.crypto?.subtle) {
    throw new Error('Secure browser crypto is required for protected profile responses.');
  }

  responseKeyPairPromise = (async () => {
    const generatedKeyPair = await window.crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt']
    );
    const publicKey = await window.crypto.subtle.exportKey('spki', generatedKeyPair.publicKey);

    responseKeyPair = generatedKeyPair;
    responsePublicKeyHeader = arrayBufferToBase64(publicKey);

    return { keyPair: responseKeyPair, publicKeyHeader: responsePublicKeyHeader };
  })();

  try {
    return await responseKeyPairPromise;
  } finally {
    responseKeyPairPromise = null;
  }
};

export const resetSensitiveResponseKeyPair = () => {
  responseKeyPair = null;
  responsePublicKeyHeader = '';
  responseKeyPairPromise = null;
};

export const getSensitiveResponseHeaders = async () => {
  const { publicKeyHeader } = await getResponseKeyPair();

  return {
    'x-eduroute-response-key': publicKeyHeader,
  };
};

export const decryptSensitiveResponseData = async (data) => {
  const envelope = data?.encryptedResponse;
  if (!envelope) return data;

  const { keyPair } = await getResponseKeyPair();
  const aesKeyBuffer = await window.crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    keyPair.privateKey,
    base64ToArrayBuffer(envelope.encryptedKey)
  );
  const aesKey = await window.crypto.subtle.importKey(
    'raw',
    aesKeyBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  const encryptedData = new Uint8Array(base64ToArrayBuffer(envelope.encryptedData));
  const authTag = new Uint8Array(base64ToArrayBuffer(envelope.authTag));
  const combinedCiphertext = new Uint8Array(encryptedData.length + authTag.length);

  combinedCiphertext.set(encryptedData, 0);
  combinedCiphertext.set(authTag, encryptedData.length);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(base64ToArrayBuffer(envelope.iv)),
      tagLength: 128,
    },
    aesKey,
    combinedCiphertext
  );

  return JSON.parse(new TextDecoder().decode(decryptedBuffer));
};

export const decryptSensitiveResponseJson = async (json) => ({
  ...json,
  data: await decryptSensitiveResponseData(json?.data),
});
