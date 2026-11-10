const express = require('express');
const crypto = require('crypto');
const { Pool, types } = require('pg');

types.setTypeParser(1700, parseFloat); // NUMERIC -> number

const isLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // dari Environment Variables
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 3,
});

const app = express();
app.use(express.json());

// ---------- Helper ----------
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (res, code, msg) => res.status(code).json({ error: msg });
const ok = (res, code, message, data) => res.status(code).json({ message, data });
const q = (sql, params = [], db = pool) => db.query(sql, params).then((r) => r.rows);
const pick = (b, fields) =>
  Object.fromEntries(fields.filter((f) => b[f] !== undefined).map((f) => [f, b[f]]));

const router = () => {
  const r = express.Router();
  r.param('id', (req, res, next, id) =>
    /^\d+$/.test(id) ? next() : fail(res, 400, 'ID harus berupa angka'));
  return r;
};

async function updateRow(table, id, data) {
  const keys = Object.keys(data);
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const rows = await q(
    `UPDATE ${table} SET ${sets} WHERE id = $${keys.length + 1} RETURNING *`,
    [...Object.values(data), Number(id)]
  );
  return rows[0];
}

// Pabrik CRUD untuk resource sederhana (kategori, produk)
function crud({ table, label, fields, check, defaults, selectSql }) {
  const r = router();

  r.get('/:id', wrap(async (req, res) => {
    const [row] = await q(`${selectSql} WHERE t.id = $1`, [req.params.id]);
    if (!row) return fail(res, 404, `${label} tidak ditemukan`);
    res.json({ data: row });
  }));

  r.post('/', wrap(async (req, res) => {
    const err = check(req.body, false);
    if (err) return fail(res, 400, err);
    const data = { ...defaults, ...pick(req.body, fields) };
    const keys = Object.keys(data);
    const [row] = await q(
      `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map((_, i) => '$' + (i + 1)).join(', ')}) RETURNING *`,
      Object.values(data)
    );
    ok(res, 201, `${label} berhasil ditambahkan`, row);
  }));

  r.put('/:id', wrap(async (req, res) => {
    const err = check(req.body, false);
    if (err) return fail(res, 400, err);
    const row = await updateRow(table, req.params.id, { ...defaults, ...pick(req.body, fields) });
    if (!row) return fail(res, 404, `${label} tidak ditemukan`);
    ok(res, 200, `${label} berhasil diperbarui`, row);
  }));

  r.patch('/:id', wrap(async (req, res) => {
    const err = check(req.body, true);
    if (err) return fail(res, 400, err);
    const data = pick(req.body, fields);
    if (!Object.keys(data).length) return fail(res, 400, 'Tidak ada field yang diubah');
    const row = await updateRow(table, req.params.id, data);
    if (!row) return fail(res, 404, `${label} tidak ditemukan`);
    ok(res, 200, `${label} berhasil diperbarui`, row);
  }));

  r.delete('/:id', wrap(async (req, res) => {
    const rows = await q(`DELETE FROM ${table} WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!rows.length) return fail(res, 404, `${label} tidak ditemukan`);
    ok(res, 200, `${label} berhasil dihapus`, { id: rows[0].id });
  }));

  return r;
}

// ---------- Categories ----------
const checkCategory = (b, partial) => {
  if (!partial && (b.name === undefined || b.name === '')) return 'Field name wajib diisi';
  if (b.name !== undefined && (typeof b.name !== 'string' || !b.name.trim())) return 'Field name tidak valid';
  return null;
};
const categories = crud({
  table: 'categories', label: 'Kategori', fields: ['name', 'description'],
  check: checkCategory, defaults: { description: null },
  selectSql: 'SELECT t.* FROM categories t',
});
categories.get('/', wrap(async (req, res) => {
  res.json({ data: await q('SELECT * FROM categories ORDER BY id') });
}));

// ---------- Products ----------
const checkProduct = (b, partial) => {
  if (!partial) {
    for (const f of ['name', 'price', 'category_id'])
      if (b[f] === undefined || b[f] === '') return `Field ${f} wajib diisi`;
  }
  if (b.name !== undefined && (typeof b.name !== 'string' || !b.name.trim())) return 'Field name tidak valid';
  if (b.price !== undefined && !(typeof b.price === 'number' && b.price >= 0)) return 'Field price harus angka >= 0';
  if (b.stock !== undefined && !(Number.isInteger(b.stock) && b.stock >= 0)) return 'Field stock harus bilangan bulat >= 0';
  if (b.category_id !== undefined && !Number.isInteger(b.category_id)) return 'Field category_id harus bilangan bulat';
  return null;
};
const PRODUCT_SQL =
  'SELECT t.*, c.name AS category_name FROM products t JOIN categories c ON c.id = t.category_id';
const products = crud({
  table: 'products', label: 'Produk',
  fields: ['category_id', 'name', 'description', 'price', 'stock'],
  check: checkProduct, defaults: { description: null, stock: 0 }, selectSql: PRODUCT_SQL,
});
products.get('/', wrap(async (req, res) => {
  const { category_id, search } = req.query;
  const where = [], params = [];
  if (category_id) { params.push(category_id); where.push(`t.category_id = $${params.length}`); }
  if (search) { params.push(`%${search}%`); where.push(`t.name ILIKE $${params.length}`); }
  const rows = await q(
    `${PRODUCT_SQL} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY t.id`, params);
  res.json({ data: rows });
}));

// ---------- Users ----------
const USER_COLS = 'id, name, email, phone, address, created_at';
const hashPassword = (pw) => {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
};
const users = router();
users.get('/', wrap(async (req, res) => {
  res.json({ data: await q(`SELECT ${USER_COLS} FROM users ORDER BY id`) });
}));
users.get('/:id', wrap(async (req, res) => {
  const [row] = await q(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [req.params.id]);
  if (!row) return fail(res, 404, 'User tidak ditemukan');
  res.json({ data: row });
}));
users.post('/', wrap(async (req, res) => {
  const { name, email, password, phone = null, address = null } = req.body;
  if (!name || typeof name !== 'string') return fail(res, 400, 'Field name wajib diisi');
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return fail(res, 400, 'Field email tidak valid');
  if (typeof password !== 'string' || password.length < 6) return fail(res, 400, 'Field password minimal 6 karakter');
  const [row] = await q(
    `INSERT INTO users (name, email, password, phone, address) VALUES ($1,$2,$3,$4,$5) RETURNING ${USER_COLS}`,
    [name, email.toLowerCase(), hashPassword(password), phone, address]);
  ok(res, 201, 'User berhasil didaftarkan', row);
}));
users.patch('/:id', wrap(async (req, res) => {
  const data = pick(req.body, ['name', 'phone', 'address']);
  if (!Object.keys(data).length) return fail(res, 400, 'Tidak ada field yang diubah (name, phone, address)');
  if (data.name !== undefined && (typeof data.name !== 'string' || !data.name.trim())) return fail(res, 400, 'Field name tidak valid');
  const row = await updateRow('users', req.params.id, data);
  if (!row) return fail(res, 404, 'User tidak ditemukan');
  delete row.password;
  ok(res, 200, 'User berhasil diperbarui', row);
}));
users.delete('/:id', wrap(async (req, res) => {
  const rows = await q('DELETE FROM users WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows.length) return fail(res, 404, 'User tidak ditemukan');
  ok(res, 200, 'User berhasil dihapus', { id: rows[0].id });
}));

// ---------- Orders ----------
const STATUSES = ['pending', 'paid', 'shipped', 'completed', 'cancelled'];
const getOrder = async (id, db = pool) => {
  const [row] = await q(
    `SELECT o.*, COALESCE(json_agg(json_build_object(
        'product_id', oi.product_id, 'name', p.name, 'quantity', oi.quantity, 'price', oi.price
      )) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE o.id = $1 GROUP BY o.id`, [id], db);
  return row;
};
const orders = router();
orders.get('/', wrap(async (req, res) => {
  const { user_id } = req.query;
  const rows = user_id
    ? await q('SELECT * FROM orders WHERE user_id = $1 ORDER BY id DESC', [user_id])
    : await q('SELECT * FROM orders ORDER BY id DESC');
  res.json({ data: rows });
}));
orders.get('/:id', wrap(async (req, res) => {
  const row = await getOrder(req.params.id);
  if (!row) return fail(res, 404, 'Pesanan tidak ditemukan');
  res.json({ data: row });
}));
orders.post('/', wrap(async (req, res) => {
  const { user_id, shipping_address, items } = req.body;
  if (!Number.isInteger(user_id)) return fail(res, 400, 'Field user_id wajib diisi (angka)');
  if (!shipping_address || typeof shipping_address !== 'string') return fail(res, 400, 'Field shipping_address wajib diisi');
  if (!Array.isArray(items) || !items.length) return fail(res, 400, 'Field items wajib berisi minimal 1 produk');
  for (const it of items)
    if (!Number.isInteger(it.product_id) || !Number.isInteger(it.quantity) || it.quantity < 1)
      return fail(res, 400, 'Setiap item butuh product_id dan quantity (bilangan bulat >= 1)');

  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    if (!(await c.query('SELECT 1 FROM users WHERE id = $1', [user_id])).rowCount)
      throw new HttpError(404, 'User tidak ditemukan');

    let total = 0;
    const lines = [];
    for (const it of items) {
      const [p] = await q('SELECT id, name, price, stock FROM products WHERE id = $1 FOR UPDATE', [it.product_id], c);
      if (!p) throw new HttpError(404, `Produk dengan id ${it.product_id} tidak ditemukan`);
      if (p.stock < it.quantity) throw new HttpError(400, `Stok ${p.name} tidak cukup (tersisa ${p.stock})`);
      await c.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [it.quantity, p.id]);
      total += p.price * it.quantity;
      lines.push({ product_id: p.id, quantity: it.quantity, price: p.price });
    }
    const [order] = await q(
      'INSERT INTO orders (user_id, shipping_address, total_price) VALUES ($1,$2,$3) RETURNING id',
      [user_id, shipping_address, total], c);
    for (const l of lines)
      await c.query('INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1,$2,$3,$4)',
        [order.id, l.product_id, l.quantity, l.price]);
    await c.query('COMMIT');
    ok(res, 201, 'Pesanan berhasil dibuat', await getOrder(order.id));
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}));
orders.patch('/:id/status', wrap(async (req, res) => {
  const { status } = req.body;
  if (!STATUSES.includes(status)) return fail(res, 400, `Field status harus salah satu dari: ${STATUSES.join(', ')}`);
  const rows = await q('UPDATE orders SET status = $1 WHERE id = $2 RETURNING id', [status, req.params.id]);
  if (!rows.length) return fail(res, 404, 'Pesanan tidak ditemukan');
  ok(res, 200, 'Status pesanan berhasil diperbarui', await getOrder(rows[0].id));
}));
orders.delete('/:id', wrap(async (req, res) => {
  const rows = await q('DELETE FROM orders WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows.length) return fail(res, 404, 'Pesanan tidak ditemukan');
  ok(res, 200, 'Pesanan berhasil dihapus', { id: rows[0].id });
}));

// ---------- Routing & error handling ----------
app.get('/', (req, res) => res.json({
  message: 'REST API Toko Online',
  endpoints: ['/categories', '/products', '/users', '/orders'],
}));
app.use('/categories', categories);
app.use('/products', products);
app.use('/users', users);
app.use('/orders', orders);

app.use((req, res) => fail(res, 404, 'Endpoint tidak ditemukan'));
app.use((err, req, res, next) => {
  if (err.status) return fail(res, err.status, err.message);
  if (err.type === 'entity.parse.failed') return fail(res, 400, 'Body JSON tidak valid');
  if (err.code === '22P02') return fail(res, 400, 'Format parameter tidak valid');
  if (err.code === '23505') return fail(res, 409, 'Data sudah ada (duplikat)');
  if (err.code === '23503')
    return /is not present/.test(err.detail || '')
      ? fail(res, 400, 'Data referensi (foreign key) tidak ditemukan')
      : fail(res, 409, 'Data tidak bisa dihapus karena masih dipakai data lain');
  console.error(err);
  fail(res, 500, 'Terjadi kesalahan pada server');
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server berjalan di http://localhost:${port}`));
}
module.exports = app;
