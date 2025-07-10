const bufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);

  return btoa(String.fromCharCode.call(null, ...bytes));
};

function base64ToBuffer(base64String: string): ArrayBuffer {
  const binaryString = atob(base64String);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes.buffer;
}

export class DecryptionError extends Error {
  constructor() {
    super("error decrypting data");
  }
}

export const deriveKey = async (password: string): Promise<CryptoKey> => {
  const keyData = new TextEncoder().encode(password);
  const baseKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  const salt = await crypto.subtle.digest("SHA-256", keyData);
  const cryptoKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  return cryptoKey;
};

export const encrypt = async (
  plaintext: string,
  key: CryptoKey
): Promise<string> => {
  const data = new TextEncoder().encode(plaintext);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedData = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );
  const encryptedResult = new Uint8Array(iv.length + encryptedData.byteLength);

  encryptedResult.set(iv, 0);
  encryptedResult.set(new Uint8Array(encryptedData), iv.length);

  return bufferToBase64(encryptedResult);
};

export const decrypt = async (
  ciphertext: string,
  key: CryptoKey
): Promise<string> => {
  const encryptedResult = base64ToBuffer(ciphertext);
  const iv = encryptedResult.slice(0, 12);
  const encryptedData = encryptedResult.slice(12);

  let data;

  try {
    data = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encryptedData
    );
  } catch (err) {
    if (err instanceof DOMException && err.name === "OperationError") {
      throw new DecryptionError();
    } else {
      throw err;
    }
  }

  return new TextDecoder().decode(data);
};
