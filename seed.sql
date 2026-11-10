INSERT INTO categories (name, description) VALUES
  ('Elektronik', 'Gadget dan perangkat elektronik'),
  ('Fashion', 'Pakaian dan aksesori'),
  ('Buku', 'Buku bacaan dan belajar');

INSERT INTO products (category_id, name, description, price, stock) VALUES
  (1, 'Earphone Bluetooth', 'Earphone nirkabel 20 jam', 150000, 50),
  (1, 'Power Bank 10000mAh', 'Fast charging', 200000, 30),
  (2, 'Kaos Polos Hitam', 'Katun combed 30s', 65000, 100),
  (3, 'Belajar Node.js', 'Panduan pemula backend', 85000, 25);
