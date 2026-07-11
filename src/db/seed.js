require("dotenv").config();
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");
const db = require("./init");

function seed() {
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
    console.log(`Compte admin cree : ${adminEmail}`);
  } else {
    console.log(`Compte admin deja existant : ${adminEmail}`);
  }

  const existingProduct = db.prepare("SELECT id FROM products LIMIT 1").get();
  if (!existingProduct) {
    db.prepare(`
      INSERT INTO products (id, name, tagline, description, price, colors, sizes, stock, image_url, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      "trm-001",
      "Hoodie Sahel",
      "Motif wax brode, coupe oversize",
      "Le Hoodie Sahel est taille dans un molleton epais 380g, avec une bande brodee inspiree des motifs wax sur la manche gauche. Coupe oversize, capuche doublee, poche kangourou renforcee.",
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
    console.log("Produit initial cree : Hoodie Sahel");
  } else {
    console.log("Des produits existent deja, seed produit ignore");
  }

  const defaultContent = {
    home_eyebrow: "DROP N1 - COLLECTION SAHEL",
    home_title_line1: "PORTE",
    home_title_line2: "TON",
    home_title_line3: "HERITAGE",
    home_subtitle: "Tramsird habille la rue avec des coupes larges et des motifs puises dans le wax. Fabrique en petites series, pense pour durer.",
    collection_heading: "LA COLLECTION",
    feature_1_label: "01 - MATIERE",
    feature_1_text: "Molleton 380g, brode main",
    feature_2_label: "02 - LIVRAISON",
    feature_2_text: "Expedie sous 48h, suivi inclus",
    feature_3_label: "03 - PAIEMENT",
    feature_3_text: "Carte bancaire ou Orange Money",
    footer_text: "2026 Tramsird - Fabrique avec fierte",
    success_title: "COMMANDE CONFIRMEE",
    success_text: "Un e-mail de confirmation te sera envoye. Ta commande part vers toi sous 48h.",
    about_heading: "A PROPOS",
    about_text: "Tramsird est ne d'une envie simple : porter fierement son heritage africain dans un vetement pense pour la rue d'aujourd'hui. Chaque piece est concue en petite serie, en melant coupes streetwear et motifs puises dans le wax. Fabrique avec soin, pense pour durer.",
    social_instagram: "",
    social_tiktok: "",
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
  console.log("Contenu texte du site initialise");
}

seed();
console.log("Termine.");
