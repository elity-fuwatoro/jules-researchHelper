// IndexedDB
let db;
const DB_NAME = 'clinicResearchDB';
const DB_VERSION = 3; // Version updated for schema change

/**
 * Initializes the IndexedDB database and creates/upgrades object stores.
 * @returns {Promise<IDBDatabase>} A promise that resolves with the database instance.
 */
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            const transaction = event.target.transaction;
            const oldVersion = event.oldVersion;
            console.log(`Upgrading database from version ${oldVersion} to ${DB_VERSION}`);

            if (oldVersion < 1) {
                if (!db.objectStoreNames.contains('currentPatients')) db.createObjectStore('currentPatients', { keyPath: 'patientId' });
                if (!db.objectStoreNames.contains('pastPatients')) {
                    const store = db.createObjectStore('pastPatients', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('patientId_idx', 'patientId', { unique: false });
                }
                if (!db.objectStoreNames.contains('researches')) db.createObjectStore('researches', { keyPath: 'researchId', autoIncrement: true });
                if (!db.objectStoreNames.contains('researchData')) {
                    const store = db.createObjectStore('researchData', { keyPath: 'dataId', autoIncrement: true });
                    store.createIndex('patientId_idx', 'patientId', { unique: false });
                    store.createIndex('researchId_idx', 'researchId', { unique: false });
                }
                if (!db.objectStoreNames.contains('app_settings')) db.createObjectStore('app_settings', { keyPath: 'key' });
            }

            if (oldVersion < 2) {
                const store = transaction.objectStore('currentPatients');
                if (!store.indexNames.contains('roomNumber_idx')) {
                    store.createIndex('roomNumber_idx', 'roomNumber', { unique: true });
                }
            }

            if (oldVersion < 3) {
                const store = transaction.objectStore('researchData');
                if (!store.indexNames.contains('patient_research_idx')) {
                    store.createIndex('patient_research_idx', ['patientId', 'researchId'], { unique: true });
                }
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            console.log('Database opened successfully');
            resolve(db);
        };
        request.onerror = (event) => reject(event.target.error);
    });
}

// --- Settings Functions ---
function saveSetting(key, value) { return new Promise((resolve, reject) => { if (!db) return reject('DB not init'); const tx = db.transaction(['app_settings'], 'readwrite'); tx.objectStore('app_settings').put({ key, value }).onsuccess = () => resolve(); tx.onerror = (e) => reject(e.target.error); }); }
function getSetting(key) { return new Promise((resolve, reject) => { if (!db) return reject('DB not init'); const tx = db.transaction(['app_settings'], 'readonly'); tx.objectStore('app_settings').get(key).onsuccess = (e) => resolve(e.target.result ? e.target.result.value : undefined); tx.onerror = (e) => reject(e.target.error); }); }

// --- Research Functions ---
function addResearch(research) { return new Promise((resolve, reject) => { const tx = db.transaction(['researches'], 'readwrite'); tx.objectStore('researches').add(research).onsuccess = (e) => resolve(e.target.result); tx.onerror = (e) => reject(e.target.error); }); }
function getAllResearches() { return new Promise((resolve, reject) => { const tx = db.transaction(['researches'], 'readonly'); tx.objectStore('researches').getAll().onsuccess = (e) => resolve(e.target.result); tx.onerror = (e) => reject(e.target.error); }); }
function deleteResearch(researchId) { return new Promise((resolve, reject) => { const tx = db.transaction(['researches'], 'readwrite'); tx.objectStore('researches').delete(researchId).onsuccess = () => resolve(); tx.onerror = (e) => reject(e.target.error); }); }

// --- Patient Management Functions ---
function getCurrentPatientById(patientId) { return new Promise((resolve, reject) => { const tx = db.transaction(['currentPatients'], 'readonly'); tx.objectStore('currentPatients').get(patientId).onsuccess = (e) => resolve(e.target.result); tx.onerror = (e) => reject(e.target.error); }); }
function getPatientByRoom(roomNumber) { return new Promise((resolve, reject) => { const tx = db.transaction(['currentPatients'], 'readonly'); tx.objectStore('currentPatients').index('roomNumber_idx').get(roomNumber).onsuccess = (e) => resolve(e.target.result); tx.onerror = (e) => reject(e.target.error); }); }
function addPatient(patientData) { return new Promise((resolve, reject) => { const tx = db.transaction(['currentPatients'], 'readwrite'); tx.objectStore('currentPatients').add(patientData).onsuccess = (e) => resolve(e.target.result); tx.onerror = (e) => reject(e.target.error); }); }
function updatePatient(patientData) { return new Promise((resolve, reject) => { const tx = db.transaction(['currentPatients'], 'readwrite'); tx.objectStore('currentPatients').put(patientData).onsuccess = (e) => resolve(e.target.result); tx.onerror = (e) => reject(e.target.error); }); }
function dischargePatient(patientId) { return new Promise((resolve, reject) => { const tx = db.transaction(['currentPatients', 'pastPatients'], 'readwrite'); const currentStore = tx.objectStore('currentPatients'); const getRequest = currentStore.get(patientId); getRequest.onsuccess = () => { const patient = getRequest.result; if (patient) { patient.dischargeDate = new Date().toISOString().split('T')[0]; const pastStore = tx.objectStore('pastPatients'); pastStore.add(patient).onsuccess = () => { currentStore.delete(patientId).onsuccess = () => resolve(); }; } else { reject(`Patient with ID ${patientId} not found.`); } }; tx.onerror = (e) => reject(e.target.error); }); }

// --- Research Data Functions ---
/**
 * Gets the research data for a specific patient and research.
 * @param {string} patientId
 * @param {number} researchId
 * @returns {Promise<object|undefined>}
 */
function getResearchData(patientId, researchId) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['researchData'], 'readonly');
        const index = tx.objectStore('researchData').index('patient_research_idx');
        index.get([patientId, researchId]).onsuccess = (e) => resolve(e.target.result);
        tx.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Saves or updates research data.
 * @param {object} dataObject - The object to save. Must include patientId and researchId.
 * @returns {Promise<number>} The ID of the saved data object.
 */
function saveResearchData(dataObject) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(['researchData'], 'readwrite');
        tx.objectStore('researchData').put(dataObject).onsuccess = (e) => resolve(e.target.result);
        tx.onerror = (e) => reject(e.target.error);
    });
}
