const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const { fetchApplicantsFromSheet } = require('./sheets');

const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'belu-hospedaje.sqlite');
const DEFAULT_BACKUP_RETENTION = 60;

let dbPromise;

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

async function getDb() {
  if (!dbPromise) {
    ensureDataDir();
    dbPromise = open({
      filename: dbPath,
      driver: sqlite3.Database
    });
  }

  return dbPromise;
}

function mapApplicantRow(row) {
  return {
    id: row.id,
    date: row.date,
    name: row.name,
    dni: row.dni,
    phone: row.phone,
    profession: row.profession,
    address: row.address,
    email: row.email,
    ingresado: Boolean(row.ingresado),
    ingresoSalida: row.ingreso_salida || ''
  };
}

function mapActiveTenantRow(row) {
  return {
    id: row.id,
    roomId: row.room_id,
    name: row.name,
    dni: row.dni,
    phone: row.phone,
    address: row.address,
    checkIn: row.check_in,
    payments: row.payments_json ? JSON.parse(row.payments_json) : {}
  };
}

function mapArchivedTenantRow(row) {
  return {
    id: row.id,
    roomId: row.room_id,
    name: row.name,
    dni: row.dni,
    phone: row.phone,
    address: row.address,
    checkIn: row.check_in,
    checkOut: row.check_out,
    notes: row.notes,
    payments: row.payments_json ? JSON.parse(row.payments_json) : {}
  };
}

async function initDatabase() {
  const db = await getDb();

  await db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS applicants (
      id TEXT PRIMARY KEY,
      date TEXT,
      name TEXT,
      dni TEXT,
      phone TEXT,
      profession TEXT,
      address TEXT,
      email TEXT,
      ingresado INTEGER NOT NULL DEFAULT 0,
      ingreso_salida TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'system',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS active_tenants (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      name TEXT,
      dni TEXT,
      phone TEXT,
      address TEXT,
      check_in TEXT,
      payments_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS archived_tenants (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      name TEXT,
      dni TEXT,
      phone TEXT,
      address TEXT,
      check_in TEXT,
      check_out TEXT,
      notes TEXT,
      payments_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS room_prices (
      room_id TEXT PRIMARY KEY,
      price REAL NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS state_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reason TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      detail_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_applicants_dni ON applicants(dni);
    CREATE INDEX IF NOT EXISTS idx_active_tenants_room_id ON active_tenants(room_id);
    CREATE INDEX IF NOT EXISTS idx_archived_tenants_room_id ON archived_tenants(room_id);
    CREATE INDEX IF NOT EXISTS idx_state_snapshots_created_at ON state_snapshots(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
  `);
}

function normalizeDni(raw) {
  return (raw || '').toString().trim().toLowerCase();
}

function validateStateIntegrity(state) {
  const applicants = Array.isArray(state.applicants) ? state.applicants : [];
  const activeTenants = Array.isArray(state.activeTenants) ? state.activeTenants : [];
  const archivedTenants = Array.isArray(state.archivedTenants) ? state.archivedTenants : [];

  const applicantDniMap = new Map();
  for (const applicant of applicants) {
    const dni = normalizeDni(applicant.dni);
    if (!dni) continue;
    if (applicantDniMap.has(dni)) {
      throw new Error(`DNI duplicado en postulantes: ${applicant.dni}`);
    }
    applicantDniMap.set(dni, true);
  }

  const activeRoomMap = new Map();
  for (const tenant of activeTenants) {
    const roomId = (tenant.roomId || '').toString().trim();
    if (!roomId) {
      throw new Error('Hay inquilinos activos sin roomId.');
    }
    if (activeRoomMap.has(roomId)) {
      throw new Error(`Habitacion duplicada en inquilinos activos: ${roomId}`);
    }
    activeRoomMap.set(roomId, true);
  }

  const tenantIdMap = new Map();
  for (const tenant of [...activeTenants, ...archivedTenants]) {
    const tenantId = (tenant.id || '').toString().trim();
    if (!tenantId) {
      throw new Error('Hay inquilinos sin ID.');
    }
    if (tenantIdMap.has(tenantId)) {
      throw new Error(`ID de inquilino duplicado: ${tenantId}`);
    }
    tenantIdMap.set(tenantId, true);
  }
}

function hasAnyData(state) {
  if (!state || typeof state !== 'object') return false;
  return (
    (state.applicants && state.applicants.length > 0) ||
    (state.activeTenants && state.activeTenants.length > 0) ||
    (state.archivedTenants && state.archivedTenants.length > 0) ||
    (state.roomPrices && Object.keys(state.roomPrices).length > 0)
  );
}

function getBackupRetention() {
  const value = Number(process.env.BACKUP_RETENTION || DEFAULT_BACKUP_RETENTION);
  if (!Number.isFinite(value) || value < 1) return DEFAULT_BACKUP_RETENTION;
  return Math.floor(value);
}

async function writeAudit(action, entityType, entityId, detail) {
  const db = await getDb();
  await db.run(
    `INSERT INTO audit_log (action, entity_type, entity_id, detail_json)
     VALUES (?, ?, ?, ?)`,
    action,
    entityType,
    entityId || null,
    detail ? JSON.stringify(detail) : null
  );
}

async function trimOldSnapshots() {
  const db = await getDb();
  const retain = getBackupRetention();

  await db.run(
    `DELETE FROM state_snapshots
     WHERE id NOT IN (
       SELECT id
       FROM state_snapshots
       ORDER BY id DESC
       LIMIT ?
     )`,
    retain
  );
}

async function createSnapshot(reason, payload) {
  const db = await getDb();
  const snapshotPayload = payload || (await getState());

  await db.run(
    'INSERT INTO state_snapshots (reason, payload_json) VALUES (?, ?)',
    reason,
    JSON.stringify(snapshotPayload)
  );

  await trimOldSnapshots();
  return true;
}

async function listSnapshots(limit = 20) {
  const db = await getDb();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 200));
  return db.all(
    `SELECT id, reason, created_at
     FROM state_snapshots
     ORDER BY id DESC
     LIMIT ?`,
    safeLimit
  );
}

async function getAuditLogs(options = {}) {
  const db = await getDb();
  const limit = Math.max(1, Math.min(Number(options.limit) || 100, 500));
  const action = options.action ? String(options.action).trim() : '';

  if (action) {
    return db.all(
      `SELECT id, action, entity_type, entity_id, detail_json, created_at
       FROM audit_log
       WHERE action = ?
       ORDER BY id DESC
       LIMIT ?`,
      action,
      limit
    );
  }

  return db.all(
    `SELECT id, action, entity_type, entity_id, detail_json, created_at
     FROM audit_log
     ORDER BY id DESC
     LIMIT ?`,
    limit
  );
}

async function getSnapshotById(id) {
  const db = await getDb();
  return db.get('SELECT id, reason, payload_json, created_at FROM state_snapshots WHERE id = ?', id);
}

async function getState() {
  const db = await getDb();

  const [applicantsRows, activeTenantRows, archivedTenantRows, roomPriceRows] = await Promise.all([
    db.all('SELECT * FROM applicants ORDER BY updated_at DESC, created_at DESC'),
    db.all('SELECT * FROM active_tenants ORDER BY room_id ASC'),
    db.all('SELECT * FROM archived_tenants ORDER BY datetime(COALESCE(check_out, created_at)) DESC'),
    db.all('SELECT room_id, price FROM room_prices ORDER BY room_id ASC')
  ]);

  return {
    applicants: applicantsRows.map(mapApplicantRow),
    activeTenants: activeTenantRows.map(mapActiveTenantRow),
    archivedTenants: archivedTenantRows.map(mapArchivedTenantRow),
    roomPrices: roomPriceRows.reduce((accumulator, row) => {
      accumulator[row.room_id] = row.price;
      return accumulator;
    }, {}),
    showHistoryInMatrix: false
  };
}

async function saveState(state, options = {}) {
  const db = await getDb();
  const applicants = Array.isArray(state.applicants) ? state.applicants : [];
  const activeTenants = Array.isArray(state.activeTenants) ? state.activeTenants : [];
  const archivedTenants = Array.isArray(state.archivedTenants) ? state.archivedTenants : [];
  const roomPrices = state.roomPrices && typeof state.roomPrices === 'object' ? state.roomPrices : {};
  const nextState = {
    applicants,
    activeTenants,
    archivedTenants,
    roomPrices,
    showHistoryInMatrix: false
  };

  validateStateIntegrity(nextState);

  if (!options.skipSnapshot) {
    const currentState = await getState();
    if (hasAnyData(currentState)) {
      await createSnapshot(options.snapshotReason || 'pre-save', currentState);
    }
  }

  await db.exec('BEGIN');

  try {
    await db.exec('DELETE FROM applicants');
    await db.exec('DELETE FROM active_tenants');
    await db.exec('DELETE FROM archived_tenants');
    await db.exec('DELETE FROM room_prices');

    const applicantStatement = await db.prepare(`
      INSERT INTO applicants (
        id, date, name, dni, phone, profession, address, email, ingresado, ingreso_salida, source, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    for (const applicant of applicants) {
      await applicantStatement.run(
        applicant.id,
        applicant.date || '',
        applicant.name || '',
        applicant.dni || '',
        applicant.phone || '',
        applicant.profession || '',
        applicant.address || '',
        applicant.email || '',
        applicant.ingresado ? 1 : 0,
        applicant.ingresoSalida || '',
        applicant.source || 'system'
      );
    }

    await applicantStatement.finalize();

    const activeTenantStatement = await db.prepare(`
      INSERT INTO active_tenants (
        id, room_id, name, dni, phone, address, check_in, payments_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    for (const tenant of activeTenants) {
      await activeTenantStatement.run(
        tenant.id,
        tenant.roomId,
        tenant.name || '',
        tenant.dni || '',
        tenant.phone || '',
        tenant.address || '',
        tenant.checkIn || '',
        JSON.stringify(tenant.payments || {})
      );
    }

    await activeTenantStatement.finalize();

    const archivedTenantStatement = await db.prepare(`
      INSERT INTO archived_tenants (
        id, room_id, name, dni, phone, address, check_in, check_out, notes, payments_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    for (const tenant of archivedTenants) {
      await archivedTenantStatement.run(
        tenant.id,
        tenant.roomId,
        tenant.name || '',
        tenant.dni || '',
        tenant.phone || '',
        tenant.address || '',
        tenant.checkIn || '',
        tenant.checkOut || '',
        tenant.notes || '',
        JSON.stringify(tenant.payments || {})
      );
    }

    await archivedTenantStatement.finalize();

    const roomPriceStatement = await db.prepare(`
      INSERT INTO room_prices (room_id, price, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `);

    for (const [roomId, price] of Object.entries(roomPrices)) {
      await roomPriceStatement.run(roomId, Number(price) || 0);
    }

    await roomPriceStatement.finalize();
    await db.exec('COMMIT');

    await writeAudit('save_state', 'state', 'GLOBAL', {
      applicants: applicants.length,
      activeTenants: activeTenants.length,
      archivedTenants: archivedTenants.length,
      roomPrices: Object.keys(roomPrices).length
    });

    if (!options.skipSnapshot) {
      const persisted = await getState();
      await createSnapshot(options.snapshotReasonFinal || 'post-save', persisted);
    }
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

function normalizeApplicantFromSheet(row, index) {
  return {
    id: `A${Date.now()}_${index}`,
    date: row[0] || '',
    name: (row[1] || '').toUpperCase(),
    dni: (row[2] || '').trim(),
    phone: row[3] || '',
    email: row[4] || '',
    address: row[5] || '',
    profession: row[6] || '',
    ingresoSalida: '',
    ingresado: false,
    source: 'google-sheet'
  };
}

async function syncApplicantsFromSheet() {
  const rows = await fetchApplicantsFromSheet();
  const db = await getDb();

  let inserted = 0;
  let updated = 0;
  const seenDni = new Set();

  await db.exec('BEGIN');

  try {
    for (const [index, row] of rows.entries()) {
      const applicant = normalizeApplicantFromSheet(row, index);
      const dniKey = applicant.dni.trim().toLowerCase();

      if (dniKey) {
        if (seenDni.has(dniKey)) {
          continue;
        }
        seenDni.add(dniKey);
      }

      let existing;

      if (dniKey) {
        existing = await db.get('SELECT * FROM applicants WHERE lower(trim(dni)) = ?', dniKey);
      }

      if (existing) {
        await db.run(
          `UPDATE applicants
           SET date = ?, name = ?, phone = ?, email = ?, address = ?, profession = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          applicant.date,
          applicant.name,
          applicant.phone,
          applicant.email,
          applicant.address,
          applicant.profession,
          existing.id
        );
        updated += 1;
      } else {
        await db.run(
          `INSERT INTO applicants (
             id, date, name, dni, phone, profession, address, email, ingresado, ingreso_salida, source, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          applicant.id,
          applicant.date,
          applicant.name,
          applicant.dni,
          applicant.phone,
          applicant.profession,
          applicant.address,
          applicant.email,
          0,
          '',
          applicant.source
        );
        inserted += 1;
      }
    }

    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }

  await writeAudit('sync_sheet', 'applicants', 'GLOBAL', {
    fetchedRows: rows.length,
    inserted,
    updated
  });

  const state = await getState();
  return {
    inserted,
    updated,
    applicants: state.applicants
  };
}

async function restoreSnapshot(snapshotId) {
  const snapshot = await getSnapshotById(snapshotId);
  if (!snapshot) {
    throw new Error(`No existe respaldo con id ${snapshotId}.`);
  }

  let payload;
  try {
    payload = JSON.parse(snapshot.payload_json);
  } catch (_error) {
    throw new Error('El respaldo esta corrupto y no se puede restaurar.');
  }

  await saveState(payload, {
    skipSnapshot: false,
    snapshotReason: `restore-source-${snapshotId}`,
    snapshotReasonFinal: `restore-applied-${snapshotId}`
  });

  await writeAudit('restore_snapshot', 'state_snapshot', String(snapshotId), {
    restoredFrom: snapshot.created_at,
    reason: snapshot.reason
  });

  return getState();
}

async function createManualSnapshot(note) {
  const state = await getState();
  await createSnapshot(note ? `manual-${note}` : 'manual');
  await writeAudit('manual_snapshot', 'state', 'GLOBAL', {
    applicants: state.applicants.length,
    activeTenants: state.activeTenants.length,
    archivedTenants: state.archivedTenants.length,
    roomPrices: Object.keys(state.roomPrices).length
  });
}

module.exports = {
  initDatabase,
  getState,
  saveState,
  syncApplicantsFromSheet,
  listSnapshots,
  restoreSnapshot,
  createManualSnapshot,
  getAuditLogs
};