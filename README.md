# Toko Online API

REST API sederhana untuk toko online: mengelola **kategori, produk, user, dan pesanan** (checkout dengan pengurangan stok otomatis dalam satu transaksi database).

**Tech stack:** Node.js, Express, PostgreSQL (Neon/Supabase), deploy di Vercel.

**URL Deployment:** `https://nama-project.vercel.app` *(ganti dengan URL Vercel kamu)*

---

## ERD

Tempel kode DBML di bawah ke [dbdiagram.io](https://dbdiagram.io), lalu export gambarnya (PNG) dan simpan di folder `docs/erd.png`.

```dbml
Table users {
  id serial [pk]
  name varchar(100) [not null]
  email varchar(150) [not null, unique]
  password varchar(255) [not null]
  phone varchar(20)
  address text
  created_at timestamptz
}
Table categories {
  id serial [pk]
  name varchar(100) [not null, unique]
  description text
}
Table products {
  id serial [pk]
  category_id int [not null, ref: > categories.id]
  name varchar(150) [not null]
  description text
  price numeric(12,2) [not null]
  stock int [not null, default: 0]
  created_at timestamptz
}
Table orders {
  id serial [pk]
  user_id int [not null, ref: > users.id]
  status varchar(20) [not null, default: 'pending']
  total_price numeric(12,2) [not null]
  shipping_address text [not null]
  created_at timestamptz
}
Table order_items {
  id serial [pk]
  order_id int [not null, ref: > orders.id]
  product_id int [not null, ref: > products.id]
  quantity int [not null]
  price numeric(12,2) [not null]
}
```

Relasi:

```
categories ──< products >──< order_items >──< orders >── users
```

- Satu `category` punya banyak `products` (one-to-many)
- Satu `user` punya banyak `orders` (one-to-many)
- `orders` dan `products` berelasi many-to-many lewat tabel pivot `order_items`

---

## Cara Menjalankan Secara Lokal

1. Pastikan Node.js versi 20.6 atau lebih baru.
2. Buat database PostgreSQL online di [Neon](https://neon.tech) atau [Supabase](https://supabase.com), lalu salin *connection string*-nya.
3. Buka SQL Editor di dashboard database, jalankan isi `db/schema.sql`, lalu `db/seed.sql`.
4. Install dan jalankan:
   ```bash
   npm install
   cp .env.example .env      # isi DATABASE_URL di file .env
   npm run dev
   ```
5. API aktif di `http://localhost:3000`.

## Deploy ke Vercel

1. Push project ke GitHub (file `.env` sudah masuk `.gitignore`).
2. Di [vercel.com](https://vercel.com) pilih **Add New > Project**, import repository.
3. Di **Settings > Environment Variables**, tambahkan `DATABASE_URL` berisi connection string database.
4. Deploy. Setelah selesai, buka URL Vercel dan pastikan `GET /` mengembalikan JSON.

---

## Dokumentasi Endpoint

Semua request dan response berformat JSON. Untuk request yang memakai body, tambahkan header `Content-Type: application/json`. Ganti `https://nama-project.vercel.app` dengan URL deployment kamu.

Format error selalu `{"error": "pesan"}`. Kode umum: `400` input salah, `404` data tidak ditemukan, `409` duplikat atau masih berelasi, `500` error server.

## Categories

### Lihat Semua Kategori
- Method: GET
- URL: https://nama-project.vercel.app/categories
- Deskripsi: Mengambil seluruh kategori
- Response Sukses (200): `{"data":[{"id":1,"name":"Elektronik","description":"Gadget dan perangkat elektronik"}]}`
- Response Error (500): `{"error":"Terjadi kesalahan pada server"}`

### Lihat Kategori by ID
- Method: GET
- URL: https://nama-project.vercel.app/categories/1
- Deskripsi: Mengambil satu kategori
- Response Sukses (200): `{"data":{"id":1,"name":"Elektronik","description":null}}`
- Response Error (404): `{"error":"Kategori tidak ditemukan"}`

### Tambah Kategori
- Method: POST
- URL: https://nama-project.vercel.app/categories
- Headers: Content-Type: application/json
- Request Body: `{"name":"Olahraga","description":"Perlengkapan olahraga"}` (`name` wajib)
- Response Sukses (201): `{"message":"Kategori berhasil ditambahkan","data":{"id":4,"name":"Olahraga","description":"Perlengkapan olahraga"}}`
- Response Error (400): `{"error":"Field name wajib diisi"}`

### Ubah Kategori (PUT, seluruh data)
- Method: PUT
- URL: https://nama-project.vercel.app/categories/1
- Headers: Content-Type: application/json
- Request Body: `{"name":"Elektronik","description":"Gadget terbaru"}`
- Response Sukses (200): `{"message":"Kategori berhasil diperbarui","data":{"id":1,"name":"Elektronik","description":"Gadget terbaru"}}`
- Response Error (404): `{"error":"Kategori tidak ditemukan"}`

### Ubah Kategori (PATCH, sebagian)
- Method: PATCH
- URL: https://nama-project.vercel.app/categories/1
- Headers: Content-Type: application/json
- Request Body: `{"description":"Deskripsi baru"}`
- Response Sukses (200): `{"message":"Kategori berhasil diperbarui","data":{...}}`
- Response Error (400): `{"error":"Tidak ada field yang diubah"}`

### Hapus Kategori
- Method: DELETE
- URL: https://nama-project.vercel.app/categories/4
- Deskripsi: Gagal jika kategori masih punya produk
- Response Sukses (200): `{"message":"Kategori berhasil dihapus","data":{"id":4}}`
- Response Error (409): `{"error":"Data tidak bisa dihapus karena masih dipakai data lain"}`

## Products (CRUD lengkap, resource utama)

### Lihat Semua Produk
- Method: GET
- URL: https://nama-project.vercel.app/products
- Query (opsional): `category_id=1`, `search=bluetooth`
- Response Sukses (200): `{"data":[{"id":1,"category_id":1,"category_name":"Elektronik","name":"Earphone Bluetooth","price":150000,"stock":50}]}`
- Response Error (400): `{"error":"Format parameter tidak valid"}` (mis. `category_id=abc`)

### Lihat Produk by ID
- Method: GET
- URL: https://nama-project.vercel.app/products/1
- Response Sukses (200): `{"data":{"id":1,"name":"Earphone Bluetooth","price":150000,"stock":50,"category_name":"Elektronik"}}`
- Response Error (404): `{"error":"Produk tidak ditemukan"}`

### Tambah Produk
- Method: POST
- URL: https://nama-project.vercel.app/products
- Headers: Content-Type: application/json
- Request Body: `{"name":"Sepatu Lari","description":"Ringan","price":350000,"stock":20,"category_id":2}` (`name`, `price`, `category_id` wajib)
- Response Sukses (201): `{"message":"Produk berhasil ditambahkan","data":{"id":5,"name":"Sepatu Lari","price":350000,"stock":20,"category_id":2}}`
- Response Error (400): `{"error":"Field name wajib diisi"}`

### Ubah Produk (PUT, seluruh data)
- Method: PUT
- URL: https://nama-project.vercel.app/products/1
- Headers: Content-Type: application/json
- Request Body: `{"name":"Earphone Bluetooth","price":160000,"stock":40,"category_id":1}`
- Response Sukses (200): `{"message":"Produk berhasil diperbarui","data":{...}}`
- Response Error (404): `{"error":"Produk tidak ditemukan"}`

### Ubah Produk (PATCH, sebagian)
- Method: PATCH
- URL: https://nama-project.vercel.app/products/1
- Headers: Content-Type: application/json
- Request Body: `{"stock":45}`
- Response Sukses (200): `{"message":"Produk berhasil diperbarui","data":{...}}`
- Response Error (400): `{"error":"Field stock harus bilangan bulat >= 0"}`

### Hapus Produk
- Method: DELETE
- URL: https://nama-project.vercel.app/products/5
- Response Sukses (200): `{"message":"Produk berhasil dihapus","data":{"id":5}}`
- Response Error (404): `{"error":"Produk tidak ditemukan"}`

## Users

### Daftar User
- Method: POST
- URL: https://nama-project.vercel.app/users
- Headers: Content-Type: application/json
- Request Body: `{"name":"Budi Santoso","email":"budi@example.com","password":"rahasia123","phone":"08123456789","address":"Jl. Slamet Riyadi No. 1"}`
- Response Sukses (201): `{"message":"User berhasil didaftarkan","data":{"id":1,"name":"Budi Santoso","email":"budi@example.com"}}` (password tidak pernah dikembalikan, disimpan dalam bentuk hash)
- Response Error (409): `{"error":"Data sudah ada (duplikat)"}` (email sudah terdaftar)

### Lihat Semua User
- Method: GET
- URL: https://nama-project.vercel.app/users
- Response Sukses (200): `{"data":[{"id":1,"name":"Budi Santoso","email":"budi@example.com"}]}`
- Response Error (500): `{"error":"Terjadi kesalahan pada server"}`

### Lihat User by ID
- Method: GET
- URL: https://nama-project.vercel.app/users/1
- Response Sukses (200): `{"data":{"id":1,"name":"Budi Santoso","email":"budi@example.com"}}`
- Response Error (404): `{"error":"User tidak ditemukan"}`

### Ubah User (PATCH)
- Method: PATCH
- URL: https://nama-project.vercel.app/users/1
- Headers: Content-Type: application/json
- Request Body: `{"phone":"08999999999"}` (boleh `name`, `phone`, `address`)
- Response Sukses (200): `{"message":"User berhasil diperbarui","data":{...}}`
- Response Error (400): `{"error":"Tidak ada field yang diubah (name, phone, address)"}`

### Hapus User
- Method: DELETE
- URL: https://nama-project.vercel.app/users/2
- Deskripsi: Gagal jika user masih punya pesanan
- Response Sukses (200): `{"message":"User berhasil dihapus","data":{"id":2}}`
- Response Error (404): `{"error":"User tidak ditemukan"}`

## Orders

### Buat Pesanan (Checkout)
- Method: POST
- URL: https://nama-project.vercel.app/orders
- Deskripsi: Membuat pesanan, menghitung total, dan mengurangi stok dalam satu transaksi
- Headers: Content-Type: application/json
- Request Body: `{"user_id":1,"shipping_address":"Jl. Slamet Riyadi No. 1","items":[{"product_id":1,"quantity":2},{"product_id":3,"quantity":1}]}`
- Response Sukses (201): `{"message":"Pesanan berhasil dibuat","data":{"id":1,"user_id":1,"status":"pending","total_price":365000,"items":[{"product_id":1,"name":"Earphone Bluetooth","quantity":2,"price":150000},{"product_id":3,"name":"Kaos Polos Hitam","quantity":1,"price":65000}]}}`
- Response Error (400): `{"error":"Stok Earphone Bluetooth tidak cukup (tersisa 50)"}`

### Lihat Semua Pesanan
- Method: GET
- URL: https://nama-project.vercel.app/orders
- Query (opsional): `user_id=1`
- Response Sukses (200): `{"data":[{"id":1,"user_id":1,"status":"pending","total_price":365000}]}`
- Response Error (400): `{"error":"Format parameter tidak valid"}`

### Lihat Pesanan by ID
- Method: GET
- URL: https://nama-project.vercel.app/orders/1
- Response Sukses (200): `{"data":{"id":1,"status":"pending","total_price":365000,"items":[...]}}`
- Response Error (404): `{"error":"Pesanan tidak ditemukan"}`

### Ubah Status Pesanan
- Method: PATCH
- URL: https://nama-project.vercel.app/orders/1/status
- Headers: Content-Type: application/json
- Request Body: `{"status":"paid"}` (`pending`, `paid`, `shipped`, `completed`, `cancelled`)
- Response Sukses (200): `{"message":"Status pesanan berhasil diperbarui","data":{...}}`
- Response Error (400): `{"error":"Field status harus salah satu dari: pending, paid, shipped, completed, cancelled"}`

### Hapus Pesanan
- Method: DELETE
- URL: https://nama-project.vercel.app/orders/1
- Response Sukses (200): `{"message":"Pesanan berhasil dihapus","data":{"id":1}}`
- Response Error (404): `{"error":"Pesanan tidak ditemukan"}`

---

## Pengujian

Import `postman/toko-online.postman_collection.json` ke Postman atau Thunder Client, lalu ubah variabel `baseUrl` menjadi URL Vercel. Urutan uji yang disarankan: Users (daftar) > Categories > Products > Orders > Contoh Error.
