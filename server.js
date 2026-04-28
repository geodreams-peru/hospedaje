const path = require('path');
const express = require('express');
const dotenv = require('dotenv');

const {
  initDatabase,
  getState,
  saveState,
  syncApplicantsFromSheet,
  listSnapshots,
  restoreSnapshot,
  createManualSnapshot,
  getAuditLogs,
  getDatabasePath
} = require('./src/db');

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
const rootDir = __dirname;
const adminToken = (process.env.ADMIN_API_TOKEN || '').trim();

app.use(express.json({ limit: '2mb' }));

function getRequestAdminToken(req) {
  const headerToken = (req.get('x-admin-token') || '').trim();
  if (headerToken) return headerToken;

  const authHeader = req.get('authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  return '';
}

function requireAdminToken(req, res, next) {
  if (!adminToken) {
    return res.status(503).json({ ok: false, error: 'ADMIN_API_TOKEN no configurado en el servidor.' });
  }

  const requestToken = getRequestAdminToken(req);
  if (requestToken !== adminToken) {
    return res.status(401).json({ ok: false, error: 'Token administrativo invalido.' });
  }

  return next();
}

app.use('/css', express.static(path.join(rootDir, 'css')));
app.use('/js', express.static(path.join(rootDir, 'js')));
app.use('/img', express.static(path.join(rootDir, 'img')));

app.get('/', (_req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/state', async (_req, res, next) => {
  try {
    const state = await getState();
    res.json(state);
  } catch (error) {
    next(error);
  }
});

app.post('/api/state', async (req, res, next) => {
  try {
    const forceOverwrite = ['1', 'true', 'yes'].includes((req.get('x-force-overwrite') || '').trim().toLowerCase());
    const canForce = forceOverwrite && adminToken && getRequestAdminToken(req) === adminToken;

    await saveState(req.body || {}, {
      allowRiskyOverwrite: canForce
    });
    const state = await getState();
    res.json({ ok: true, state });
  } catch (error) {
    next(error);
  }
});

app.get('/api/diagnostics/counts', async (_req, res, next) => {
  try {
    const state = await getState();
    res.json({
      ok: true,
      dbPath: getDatabasePath(),
      counts: {
        applicants: state.applicants.length,
        activeTenants: state.activeTenants.length,
        archivedTenants: state.archivedTenants.length,
        roomPrices: Object.keys(state.roomPrices || {}).length
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/applicants/sync', async (_req, res, next) => {
  try {
    const result = await syncApplicantsFromSheet();
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

app.get('/api/backups', async (req, res, next) => {
  try {
    const limit = Number(req.query.limit || 20);
    const backups = await listSnapshots(limit);
    res.json({ ok: true, backups });
  } catch (error) {
    next(error);
  }
});

app.post('/api/backups', async (req, res, next) => {
  try {
    const note = (req.body && req.body.note ? String(req.body.note) : '').trim();
    await createManualSnapshot(note);
    const backups = await listSnapshots(10);
    res.json({ ok: true, backups });
  } catch (error) {
    next(error);
  }
});

app.get('/api/audit', requireAdminToken, async (req, res, next) => {
  try {
    const limit = Number(req.query.limit || 100);
    const action = req.query.action ? String(req.query.action) : '';
    const logs = await getAuditLogs({ limit, action });
    res.json({ ok: true, logs });
  } catch (error) {
    next(error);
  }
});

app.post('/api/backups/:id/restore', requireAdminToken, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) {
      return res.status(400).json({ ok: false, error: 'ID de respaldo invalido.' });
    }

    const state = await restoreSnapshot(id);
    return res.json({ ok: true, state });
  } catch (error) {
    return next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({
    ok: false,
    error: error.message || 'Error interno del servidor'
  });
});

initDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`Belu Hospedaje corriendo en http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('No se pudo inicializar la base de datos:', error);
    process.exit(1);
  });