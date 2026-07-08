require("dotenv").config();
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");
const db = require("./init");

function seed() {
  // --- Compte admin ---
  const adminEmail = process.env.ADMIN_EMAIL || "admin@tramsird.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "changeme123";

  const existingAdmin = db.prepare("SELECT id FROM admins WHERE email = ?").get(adminEmail);
  if (!existingAdmin) {
    const hash = bcrypt.hashSync(adminPassword, 10);
    db.prepare("INSERT INTO admins (id, email, password_hash) VALUES (?, ?, ?)").run(
      uuidv4(),
      adminEmail,
      hash
    );
    console.log(`✔ Compte admin créé : ${adminEmail}`);
  } else {
    console.log(`— Compte admin déjà existant : ${adminEmail}`);
  }

  // --- Produit initial ---
  const existingProduct = db.prepare("SELECT id FROM products LIMIT 1").get();
  if (!existingProduct) {
    db.prepare(`
      INSERT INTO products (id, name, tagline, description, price, colors, sizes, stock, image_url, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      "trm-001",
      "Hoodie Sahel",
      "Motif wax brodé, coupe oversize",
      "Le Hoodie Sahel est taillé dans un molleton épais 380g, avec une bande brodée inspirée des motifs wax sur la manche gauche. Coupe oversize, capuche doublée, poche kangourou renforcée.",
      28000,
      JSON.stringify([
        { name: "Terracotta", hex: "#C4562B" },
        { name: "Noir", hex: "#141110" },
        { name: "Moutarde", hex: "#E8A33D" },
      ]),
      JSON.stringify(["S", "M", "L", "XL", "XXL"]),
      14,
      null
    );
    console.log("✔ Produit initial créé : Hoodie Sahel");
  } else {
    console.log("— Des produits existent déjà, seed produit ignoré");
  }

  // --- Contenu texte du site (valeurs par défaut, modifiables ensuite depuis l'admin) ---
  const defaultContent = {
    home_eyebrow: "DROP N°01 — COLLECTION SAHEL",
    home_title_line1: "PORTE",
    home_title_line2: "TON",
    home_title_line3: "HÉRITAGE",
    home_subtitle: "Tramsird habille la rue avec des coupes larges et des motifs puisés dans le wax. Fabriqué en petites séries, pensé pour durer.",
    collection_heading: "LA COLLECTION",
    feature_1_label: "01 — MATIÈRE",
    feature_1_text: "Molleton 380g, brodé main",
    feature_2_label: "02 — LIVRAISON",
    feature_2_text: "Expédié sous 48h, suivi inclus",
    feature_3_label: "03 — PAIEMENT",
    feature_3_text: "Carte bancaire ou Orange Money",
    footer_text: "© 2026 Tramsird — Fabriqué avec fierté",
    success_title: "COMMANDE CONFIRMÉE",
    success_text: "Un e-mail de confirmation te sera envoyé. Ta commande part vers toi sous 48h.",
  };

  const insertContent = db.prepare(
    "INSERT OR IGNORE INTO site_content (key, value) VALUES (@key, @value)"
  );
  const insertMany = db.transaction((entries) => {
    for (const [key, value] of entries) {
      insertContent.run({ key, value });
    }
  });
  insertMany(Object.entries(defaultContent));
  console.log("✔ Contenu texte du site initialisé (ou déjà existant)");
}

seed();
console.log("Terminé.");
