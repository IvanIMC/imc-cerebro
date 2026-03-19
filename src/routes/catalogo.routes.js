import express from 'express';
import {
  searchCatalog,
  getProductByCode,
  getProductsByMarca,
  getProductStockByCode,
  getProductPricesByCode
} from '../services/catalogo.service.js';

const router = express.Router();

router.get('/ping', (req, res) => {
  res.json({
    ok: true,
    mensaje: 'Catálogo activo'
  });
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

    const resultados = await searchCatalog(q, {
      limit: req.query.limit || 50
    });

    return res.json({
      ok: true,
      q,
      cantidad: resultados.length,
      resultados
    });
  } catch (error) {
    console.error('Error en /catalogo/buscar:', error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get('/producto/:codigo', async (req, res) => {
  try {
    const { codigo } = req.params;

    const producto = await getProductByCode(codigo);

    if (!producto) {
      return res.status(404).json({
        ok: false,
        error: 'Producto no encontrado'
      });
    }

    return res.json({
      ok: true,
      producto
    });
  } catch (error) {
    console.error('Error en /catalogo/producto/:codigo:', error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get('/marca/:marca', async (req, res) => {
  try {
    const { marca } = req.params;

    const resultados = await getProductsByMarca(marca, {
      limit: req.query.limit || 100
    });

    return res.json({
      ok: true,
      marca,
      cantidad: resultados.length,
      resultados
    });
  } catch (error) {
    console.error('Error en /catalogo/marca/:marca:', error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get('/stock/:codigo', async (req, res) => {
  try {
    const { codigo } = req.params;

    const stock = await getProductStockByCode(codigo);

    if (!stock) {
      return res.status(404).json({
        ok: false,
        error: 'Producto no encontrado'
      });
    }

    return res.json({
      ok: true,
      stock
    });
  } catch (error) {
    console.error('Error en /catalogo/stock/:codigo:', error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get('/precios/:codigo', async (req, res) => {
  try {
    const { codigo } = req.params;

    const precios = await getProductPricesByCode(codigo);

    if (!precios) {
      return res.status(404).json({
        ok: false,
        error: 'Producto no encontrado'
      });
    }

    return res.json({
      ok: true,
      precios
    });
  } catch (error) {
    console.error('Error en /catalogo/precios/:codigo:', error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

export default router;
