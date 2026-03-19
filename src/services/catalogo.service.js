import { supabase } from '../lib/supabase.js';

const PRICE_TYPE_MAP = {
  precio_final_lista_1: 'precio_l1',
  precio_final_lista_4: 'precio_l4',
  precio_final_lista_5: 'precio_l5',
  lista_1: 'precio_l1',
  lista_4: 'precio_l4',
  lista_5: 'precio_l5',
  l1: 'precio_l1',
  l4: 'precio_l4',
  l5: 'precio_l5'
};

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function normalizePriceType(tipoPrecio) {
  if (!tipoPrecio) return null;
  const key = String(tipoPrecio).trim().toLowerCase();
  return PRICE_TYPE_MAP[key] || null;
}

async function getStocksByProductIds(productIds = []) {
  if (!productIds.length) return new Map();

  const { data: stocks, error } = await supabase
    .from('stock_actual')
    .select(`
      producto_id,
      fuente,
      stock,
      ubicacion_id,
      disponible,
      sync_run_id,
      actualizado_en
    `)
    .in('producto_id', productIds);

  if (error) throw error;

  const ubicacionIds = unique((stocks || []).map(row => row.ubicacion_id));

  let ubicacionesMap = new Map();

  if (ubicacionIds.length) {
    const { data: ubicaciones, error: ubicacionesError } = await supabase
      .from('ubicaciones')
      .select(`
        id,
        codigo,
        descripcion,
        activo,
        created_at
      `)
      .in('id', ubicacionIds);

    if (ubicacionesError) throw ubicacionesError;

    ubicacionesMap = new Map(
      (ubicaciones || []).map(ubicacion => [ubicacion.id, ubicacion])
    );
  }

  const stockMap = new Map();

  for (const row of stocks || []) {
    const ubicacion = row.ubicacion_id ? ubicacionesMap.get(row.ubicacion_id) || null : null;

    stockMap.set(row.producto_id, {
      fuente: row.fuente,
      stock: row.stock ?? 0,
      disponible: row.disponible,
      sync_run_id: row.sync_run_id,
      actualizado_en: row.actualizado_en,
      ubicacion: ubicacion
        ? {
            id: ubicacion.id,
            codigo: ubicacion.codigo,
            descripcion: ubicacion.descripcion,
            activo: ubicacion.activo
          }
        : null
    });
  }

  return stockMap;
}

async function getPricesByProductIds(productIds = []) {
  if (!productIds.length) return new Map();

  const { data: prices, error } = await supabase
    .from('producto_precios')
    .select(`
      producto_id,
      fuente,
      tipo_precio,
      precio,
      moneda,
      sync_run_id,
      actualizado_en
    `)
    .in('producto_id', productIds);

  if (error) throw error;

  const priceMap = new Map();

  for (const row of prices || []) {
    if (!priceMap.has(row.producto_id)) {
      priceMap.set(row.producto_id, {
        fuente: row.fuente || null,
        moneda: row.moneda || null,
        actualizado_en: row.actualizado_en || null,
        sync_run_id: row.sync_run_id || null,
        precio_l1: null,
        precio_l4: null,
        precio_l5: null,
        detalle: []
      });
    }

    const current = priceMap.get(row.producto_id);
    const normalizedType = normalizePriceType(row.tipo_precio);

    if (normalizedType) {
      current[normalizedType] = row.precio;
    }

    current.detalle.push({
      tipo_precio: row.tipo_precio,
      precio: row.precio,
      moneda: row.moneda,
      actualizado_en: row.actualizado_en
    });

    if (!current.actualizado_en && row.actualizado_en) {
      current.actualizado_en = row.actualizado_en;
    }
  }

  return priceMap;
}

function buildCatalogItem(product, stockMap, priceMap) {
  const stockData = stockMap.get(product.id) || null;
  const priceData = priceMap.get(product.id) || null;

  return {
    producto_id: product.id,
    codigo: product.codigo,
    descripcion: product.descripcion,
    marca: product.marca,
    modelo: product.modelo,
    rubro: product.rubro,
    codigo_barras: product.codigo_barras,
    tipo: product.tipo,
    activo: product.activo,

    stock: stockData?.stock ?? 0,
    disponible: stockData?.disponible ?? false,
    stock_fuente: stockData?.fuente ?? null,
    stock_actualizado_en: stockData?.actualizado_en ?? null,

    ubicacion: stockData?.ubicacion
      ? {
          id: stockData.ubicacion.id,
          codigo: stockData.ubicacion.codigo,
          descripcion: stockData.ubicacion.descripcion
        }
      : null,

    precio_l1: priceData?.precio_l1 ?? null,
    precio_l4: priceData?.precio_l4 ?? null,
    precio_l5: priceData?.precio_l5 ?? null,
    moneda: priceData?.moneda ?? null,
    precios_fuente: priceData?.fuente ?? null,
    precios_actualizado_en: priceData?.actualizado_en ?? null
  };
}

async function enrichProducts(products = []) {
  if (!products.length) return [];

  const productIds = products.map(product => product.id);
  const [stockMap, priceMap] = await Promise.all([
    getStocksByProductIds(productIds),
    getPricesByProductIds(productIds)
  ]);

  return products.map(product => buildCatalogItem(product, stockMap, priceMap));
}

export async function searchCatalog(q, options = {}) {
  const limit = Number(options.limit || 50);

  const text = String(q || '').trim();
  if (!text) {
    throw new Error('Falta el parámetro q');
  }

  const { data: products, error } = await supabase
    .from('productos')
    .select(`
      id,
      codigo,
      descripcion,
      marca,
      modelo,
      rubro,
      codigo_barras,
      tipo,
      activo,
      created_at,
      updated_at
    `)
    .eq('activo', true)
    .or(
      [
        `codigo.ilike.%${text}%`,
        `descripcion.ilike.%${text}%`,
        `marca.ilike.%${text}%`,
        `modelo.ilike.%${text}%`,
        `rubro.ilike.%${text}%`,
        `codigo_barras.ilike.%${text}%`,
        `tipo.ilike.%${text}%`
      ].join(',')
    )
    .order('codigo', { ascending: true })
    .limit(limit);

  if (error) throw error;

  return await enrichProducts(products || []);
}

export async function getProductByCode(codigo) {
  const code = String(codigo || '').trim();
  if (!code) {
    throw new Error('Falta el código');
  }

  const { data: product, error } = await supabase
    .from('productos')
    .select(`
      id,
      codigo,
      descripcion,
      marca,
      modelo,
      rubro,
      codigo_barras,
      tipo,
      activo,
      created_at,
      updated_at
    `)
    .eq('codigo', code)
    .maybeSingle();

  if (error) throw error;
  if (!product) return null;

  const enriched = await enrichProducts([product]);
  return enriched[0] || null;
}

export async function getProductsByMarca(marca, options = {}) {
  const limit = Number(options.limit || 100);
  const marcaText = String(marca || '').trim();

  if (!marcaText) {
    throw new Error('Falta la marca');
  }

  const { data: products, error } = await supabase
    .from('productos')
    .select(`
      id,
      codigo,
      descripcion,
      marca,
      modelo,
      rubro,
      codigo_barras,
      tipo,
      activo,
      created_at,
      updated_at
    `)
    .eq('activo', true)
    .ilike('marca', marcaText)
    .order('codigo', { ascending: true })
    .limit(limit);

  if (error) throw error;

  return await enrichProducts(products || []);
}

export async function getProductStockByCode(codigo) {
  const product = await getProductByCode(codigo);
  if (!product) return null;

  return {
    producto_id: product.producto_id,
    codigo: product.codigo,
    descripcion: product.descripcion,
    marca: product.marca,
    stock: product.stock,
    disponible: product.disponible,
    fuente: product.stock_fuente,
    actualizado_en: product.stock_actualizado_en,
    ubicacion: product.ubicacion
  };
}

export async function getProductPricesByCode(codigo) {
  const code = String(codigo || '').trim();
  if (!code) {
    throw new Error('Falta el código');
  }

  const { data: product, error: productError } = await supabase
    .from('productos')
    .select(`
      id,
      codigo,
      descripcion,
      marca,
      activo
    `)
    .eq('codigo', code)
    .maybeSingle();

  if (productError) throw productError;
  if (!product) return null;

  const pricesMap = await getPricesByProductIds([product.id]);
  const prices = pricesMap.get(product.id) || {
    fuente: null,
    moneda: null,
    actualizado_en: null,
    sync_run_id: null,
    precio_l1: null,
    precio_l4: null,
    precio_l5: null,
    detalle: []
  };

  return {
    producto_id: product.id,
    codigo: product.codigo,
    descripcion: product.descripcion,
    marca: product.marca,
    fuente: prices.fuente,
    moneda: prices.moneda,
    actualizado_en: prices.actualizado_en,
    sync_run_id: prices.sync_run_id,
    precio_l1: prices.precio_l1,
    precio_l4: prices.precio_l4,
    precio_l5: prices.precio_l5,
    detalle: prices.detalle
  };
}