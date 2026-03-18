import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { supabase } from './src/lib/supabase.js';
import gesuRoutes from './src/routes/gesu.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ ok: true, mensaje: 'IMC cerebro activo' });
});

app.get('/productos', async (req, res) => {
  try {
    const { data, error } = await supabase.from('productos').select('*');
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.use('/gesu', gesuRoutes);

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});