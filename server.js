import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import gesuRoutes from './src/routes/gesu.routes.js';
import catalogoRoutes from './src/routes/catalogo.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ ok: true, mensaje: 'IMC cerebro activo' });
});

app.use('/gesu', gesuRoutes);
app.use('/catalogo', catalogoRoutes);

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});