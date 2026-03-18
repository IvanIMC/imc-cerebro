import dotenv from 'dotenv';
import { supabase } from '../../lib/supabase.js';

dotenv.config();

const GESU_API_BASE_URL = process.env.GESU_API_BASE_URL;
const GESU_API_TOKEN = process.env.GESU_API_TOKEN;

if (!GESU_API_BASE_URL || !GESU_API_TOKEN) {
  throw new Error('Faltan GESU_API_BASE_URL o GESU_API_TOKEN en el .env');
}

function buildGesuUrl(page) {
  const url = new URL(GESU_API_BASE_URL);
  url.searchParams.set('pag', String(page));
  url.searchParams.set('token', GESU_API_TOKEN);
  return url.toString();
}

function extractItemsFromResponse(data) {
  if (!data) return [];

  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.result)) return data.result;
  if (Array.isArray(data.results)) return data.results;

  // Caso GESU: data viene como objeto con claves "1", "2", "3", etc.
  if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
    return Object.values(data.data);
  }

  if (data.items && typeof data.items === 'object' && !Array.isArray(data.items)) {
    return Object.values(data.items);
  }

  return [];
}

function extractHeaderFromResponse(data) {
  if (data?.header && typeof data.header === 'object') {
    return data.header;
  }
  return null;
}

function pick(obj, keys = []) {
  for (const key of keys) {
    if (obj?.[key] !== undefined) return obj[key];
  }
  return null;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;

  const raw = String(value).trim();
  if (!raw) return null;

  if (raw.includes(',') && raw.includes('.')) {
    const normalized = raw.replace(/\./g, '').replace(',', '.');
    const n = Number(normalized);
    return Number.isNaN(n) ? null : n;
  }

  if (raw.includes(',')) {
    const normalized = raw.replace(',', '.');
    const n = Number(normalized);
    return Number.isNaN(n) ? null : n;
  }

  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

function mapGesuItem(rawItem, pageNumber, itemIndex, syncRunId) {
  return {
    source: 'GESU',
    sync_run_id: syncRunId,
    page_number: pageNumber,
    item_index: itemIndex,
    codigo_interno: pick(rawItem, ['codigoInterno', 'CodigoInterno', 'codigo_interno']),
    marca: pick(rawItem, ['marca', 'Marca']),
    titulo: pick(rawItem, ['titulo', 'Titulo', 'title']),
    stock: toNumber(pick(rawItem, ['stock', 'Stock'])),
    precio_final_lista_1: toNumber(pick(rawItem, ['precioFinalLista1', 'PrecioFinalLista1'])),
    precio_final_lista_4: toNumber(pick(rawItem, ['precioFinalLista4', 'PrecioFinalLista4'])),
    precio_final_lista_5: toNumber(pick(rawItem, ['precioFinalLista5', 'PrecioFinalLista5'])),
    ubicacion_interna: pick(rawItem, ['ubicacionInterna', 'UbicacionInterna', 'ubicacion_interna']),
    codigo_proveedor: pick(rawItem, ['codigoProveedor', 'CodigoProveedor', 'codigo_proveedor']),
    tipo: pick(rawItem, ['Tipo', 'tipo']),
    codigo_barras: pick(rawItem, ['CodigoBarras', 'codigoBarras', 'codigo_barras']),
    payload: rawItem
  };
}

async function createSyncRun(metadata = {}) {
  const { data, error } = await supabase
    .from('sync_runs')
    .insert({
      source: 'GESU',
      status: 'running',
      metadata
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateSyncRun(syncRunId, patch) {
  const { error } = await supabase
    .from('sync_runs')
    .update(patch)
    .eq('id', syncRunId);

  if (error) throw error;
}

async function clearGesuRawTable() {
  const { error } = await supabase.rpc('truncate_gesu_items_raw');
  if (error) throw error;
}

async function getRunningGesuSyncRun() {
  const { data, error } = await supabase
    .from('sync_runs')
    .select('id, source, status, started_at, metadata')
    .eq('source', 'GESU')
    .eq('status', 'running')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

function buildSkippedResponse(reason, runningSyncRun) {
  return {
    ok: false,
    skipped: true,
    reason,
    runningSyncRunId: runningSyncRun?.id ?? null,
    runningSyncRun: runningSyncRun ?? null
  };
}

async function fetchGesuPage(pageNumber = 1) {
  const url = buildGesuUrl(pageNumber);

  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`GESU respondió ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

async function importGesuPageWithSyncRun(pageNumber, syncRunId) {
  const rawResponse = await fetchGesuPage(pageNumber);
  const header = extractHeaderFromResponse(rawResponse);
  const items = extractItemsFromResponse(rawResponse);

  if (!items.length) {
    return {
      pageNumber,
      header,
      fetched: 0,
      inserted: 0,
      hasMore: false
    };
  }

  const rows = items.map((item, index) =>
    mapGesuItem(item, pageNumber, index + 1, syncRunId)
  );

  const { error: insertError } = await supabase
    .from('gesu_items_raw')
    .insert(rows);

  if (insertError) throw insertError;

  let hasMore = true;

  if (header && Number(header.data_pag) > 0) {
    hasMore = Number(header.data_pag) >= 1000;
  } else {
    hasMore = items.length >= 1000;
  }

  return {
    pageNumber,
    header,
    fetched: items.length,
    inserted: rows.length,
    hasMore
  };
}

export async function importGesuOnePage(pageNumber = 1, options = {}) {
  const {
    mode = 'manual_test_one_page',
    allowIfRunning = false
  } = options;

  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new Error('El número de página debe ser un entero mayor o igual a 1');
  }

  if (!allowIfRunning) {
    const runningSyncRun = await getRunningGesuSyncRun();
    if (runningSyncRun) {
      return buildSkippedResponse('Ya hay una importación GESU en curso', runningSyncRun);
    }
  }

  const syncRun = await createSyncRun({ mode, page_number: pageNumber });

  try {
    const result = await importGesuPageWithSyncRun(pageNumber, syncRun.id);

    await updateSyncRun(syncRun.id, {
      finished_at: new Date().toISOString(),
      status: 'success',
      pages_requested: 1,
      pages_processed: result.fetched > 0 ? 1 : 0,
      records_fetched: result.fetched,
      records_inserted: result.inserted,
      metadata: {
        mode,
        page_number: pageNumber,
        header: result.header
      }
    });

    return {
      ok: true,
      syncRunId: syncRun.id,
      pageNumber,
      fetched: result.fetched,
      inserted: result.inserted
    };
  } catch (error) {
    await updateSyncRun(syncRun.id, {
      finished_at: new Date().toISOString(),
      status: 'error',
      error_message: error.message
    });

    throw error;
  }
}

export async function importGesuAllPages(options = {}) {
  const {
    mode = 'manual_full_import',
    skipIfRunning = true
  } = options;

  if (skipIfRunning) {
    const runningSyncRun = await getRunningGesuSyncRun();
    if (runningSyncRun) {
      return buildSkippedResponse('Ya hay una importación GESU en curso', runningSyncRun);
    }
  }

  const syncRun = await createSyncRun({ mode });

  let page = 1;
  let totalFetched = 0;
  let totalInserted = 0;
  let pagesProcessed = 0;
  let lastHeader = null;

  try {
    await clearGesuRawTable();

    await updateSyncRun(syncRun.id, {
      metadata: {
        mode,
        raw_table_truncated: true
      }
    });

    while (true) {
      const result = await importGesuPageWithSyncRun(page, syncRun.id);

      lastHeader = result.header;
      totalFetched += result.fetched;
      totalInserted += result.inserted;

      if (result.fetched > 0) {
        pagesProcessed += 1;
      }

      await updateSyncRun(syncRun.id, {
        pages_requested: page,
        pages_processed: pagesProcessed,
        records_fetched: totalFetched,
        records_inserted: totalInserted,
        metadata: {
          mode,
          raw_table_truncated: true,
          last_page_processed: page,
          last_header: lastHeader
        }
      });

      if (result.fetched === 0) {
        break;
      }

      if (!result.hasMore) {
        break;
      }

      page += 1;
    }

    await updateSyncRun(syncRun.id, {
      finished_at: new Date().toISOString(),
      status: 'success',
      pages_requested: page,
      pages_processed: pagesProcessed,
      records_fetched: totalFetched,
      records_inserted: totalInserted,
      metadata: {
        mode,
        raw_table_truncated: true,
        last_header: lastHeader
      }
    });

    return {
      ok: true,
      syncRunId: syncRun.id,
      pagesProcessed,
      fetched: totalFetched,
      inserted: totalInserted
    };
  } catch (error) {
    await updateSyncRun(syncRun.id, {
      finished_at: new Date().toISOString(),
      status: 'error',
      error_message: error.message,
      pages_requested: page,
      pages_processed: pagesProcessed,
      records_fetched: totalFetched,
      records_inserted: totalInserted,
      metadata: {
        mode,
        raw_table_truncated: true,
        last_header: lastHeader
      }
    });

    throw error;
  }
}