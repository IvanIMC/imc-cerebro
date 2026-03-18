import express from 'express';
import { supabase } from '../lib/supabase.js';
import { importGesuOnePage, importGesuAllPages } from '../services/gesu/gesu.service.js';

const router = express.Router();

function getBearerToken(authHeader = '') {
  if (!authHeader || typeof authHeader !== 'string') return null;
  if (!authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

router.get('/ping', async (req, res) => {
  res.json({ ok: true, mensaje: 'Ruta GESU activa' });
});

router.get('/importar/prueba', async (req, res) => {
  try {
    const rawPage = req.query.page ?? '1';
    const page = Number(rawPage);

    if (!Number.isInteger(page) || page < 1) {
      return res.status(400).json({
        ok: false,
        error: 'El parámetro page debe ser un número entero mayor o igual a 1'
      });
    }

    const result = await importGesuOnePage(page, {
      mode: 'manual_test_one_page'
    });

    if (result?.skipped) {
      return res.status(409).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error('Error en /gesu/importar/prueba:', error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get('/importar/todo', async (req, res) => {
  try {
    if (isProduction()) {
      return res.status(403).json({
        ok: false,
        error: 'Ruta deshabilitada en producción. Usar /gesu/importar/todo/secure'
      });
    }

    const result = await importGesuAllPages({
      mode: 'manual_full_import'
    });

    if (result?.skipped) {
      return res.status(409).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error('Error en /gesu/importar/todo:', error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.post('/importar/todo/secure', async (req, res) => {
  try {
    if (!process.env.CRON_SECRET) {
      return res.status(500).json({
        ok: false,
        error: 'Falta CRON_SECRET en el .env'
      });
    }

    const authHeader = req.headers.authorization || '';
    const token = getBearerToken(authHeader);

    if (!token) {
      return res.status(401).json({
        ok: false,
        error: 'Header Authorization inválido o ausente'
      });
    }

    if (token !== process.env.CRON_SECRET) {
      return res.status(401).json({
        ok: false,
        error: 'No autorizado'
      });
    }

    const result = await importGesuAllPages({
      mode: 'scheduled_full_import'
    });

    if (result?.skipped) {
      return res.status(409).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error('Error en /gesu/importar/todo/secure:', error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get('/buscar', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();

    if (!q) {
      return res.status(400).json({
        ok: false,
        error: 'Falta el parámetro q'
      });
    }

    const { data, error } = await supabase
      .from('gesu_items_raw')
      .select(`
        id,
        codigo_interno,
        marca,
        titulo,
        stock,
        precio_final_lista_1,
        precio_final_lista_4,
        precio_final_lista_5,
        ubicacion_interna,
        codigo_proveedor,
        tipo,
        codigo_barras,
        imported_at
      `)
      .or(
        `codigo_interno.ilike.%${q}%,titulo.ilike.%${q}%,marca.ilike.%${q}%,codigo_proveedor.ilike.%${q}%`
      )
      .order('id', { ascending: false })
      .limit(50);

    if (error) throw error;

    return res.json({
      ok: true,
      q,
      cantidad: data.length,
      resultados: data
    });
  } catch (error) {
    console.error('Error en /gesu/buscar:', error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

export default router;