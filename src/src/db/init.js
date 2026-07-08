const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "..", "..", "tramsird.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  price INTEGER NOT NULL,           -- prix en FCFA (entier, unité de base)
  colors TEXT NOT NULL DEFAULT '[]', -- JSON: [{"name":"Terracotta","hex":"#C4562B"}]
  sizes TEXT NOT NULL DEFAULT '[]',  -- JSON: ["S","M","L","XL"]
  stock INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  active INTEGER NOT NULL DEFAULT 1, -- 1 = visible sur le site, 0 = masqué
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  shipping_address TEXT,
  items TEXT NOT NULL,              -- JSON: [{"product_id","name","color","size","qty","unit_price"}]
  subtotal INTEGER NOT NULL,
  shipping_fee INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'XOF',
  payment_method TEXT,              -- 'card' | 'orange_money'
  payment_status TEXT NOT NULL DEFAULT 'pending', -- pending | paid | failed | cancelled
  cinetpay_transaction_id TEXT,
  status TEXT NOT NULL DEFAULT 'new', -- new | processing | shipped | delivered | cancelled
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Stocke tous les textes modifiables du site (titre d'accueil, slogans, blocs, pied de page...)
-- Une ligne = un texte, identifié par une clé stable (ex: "home_title").
CREATE TABLE IF NOT EXISTS site_content (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
`);

module.exports = db;
