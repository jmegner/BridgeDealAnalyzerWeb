let database;
function open() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("bridge-study", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("hands", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}
export async function loadCollection() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction("hands").objectStore("hands").getAll();
    request.onsuccess = () =>
      resolve(request.result.sort((a, b) => a.added - b.added));
    request.onerror = () => reject(request.error);
  });
}
export async function saveHands(hands) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("hands", "readwrite");
    for (const hand of hands) transaction.objectStore("hands").put(hand);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
export async function clearCollection() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("hands", "readwrite");
    transaction.objectStore("hands").clear();
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}
