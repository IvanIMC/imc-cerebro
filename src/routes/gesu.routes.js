import express from 'express';
import { importGesuOnePage, importGesuAllPages } from '../services/gesu/gesu.service.js';

const router = express.Router();

function getBearerToken(authHeader = '') {
  if (!authHeader || typeof authHeader !== 'string') return null;
  if (!authHeader.startsWith('Bearer ')) return null;

  return authHeader.slice('Bearer '.length).trim() || null;
}

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

router.get('/ping', (req, res) => {
  res.json({ ok: true, mensaje: 'GESU activo' });
});

router.get('/importar/prueba', async (req, res) => {
  try {
    const page = Number(req.query.page || 1);

    const result = await importGesuOnePage(page);

    if (result?.skipped) return res.status(409).json(result);

    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/importar/todo', async (req, res) => {
  try {
    if (isProduction()) {
      return res.status(403).json({
        ok: false,
        error: 'Usar ruta secure'
      });
    }

    const result = await importGesuAllPages();

    if (result?.skipped) return res.status(409).json(result);

    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/importar/todo/secure', async (req, res) => {
  try {
    const token = getBearerToken(req.headers.authorization || '');

    if (!token || token !== process.env.CRON_SECRET) {
      return res.status(401).json({ ok: false, error: 'No autorizado' });
    }

    const result = await importGesuAllPages({
      mode: 'scheduled_full_import'
    });

    if (result?.skipped) return res.status(409).json(result);

    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;