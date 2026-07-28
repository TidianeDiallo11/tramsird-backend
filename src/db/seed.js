const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");
const db = require("./init");

async function seed() {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@tramsird.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "changeme123";

  const existingAdmin = await db.one("SELECT id FROM admins WHERE email = $1", [adminEmail]);
  if (!existingAdmin) {
    const hash = bcrypt.hashSync(adminPassword, 10);
    await db.query("INSERT INTO admins (id, email, password_hash) VALUES ($1, $2, $3)", [
      uuidv4(),
      adminEmail,
      hash,
    ]);
    console.log(`Compte admin cree : ${adminEmail}`);
  } else {
    console.log(`Compte admin deja existant : ${adminEmail}`);
  }

  const existingProduct = await db.one("SELECT id FROM products LIMIT 1");
  if (!existingProduct) {
    await db.query(
      `INSERT INTO products (id, name, tagline, description, price, colors, sizes, stock, image_url, category, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1)`,
      [
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
        null,
        "hoodies",
      ]
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
    feature_3_text: "Carte bancaire, PayPal ou Orange Money",
    footer_text: "2026 Tramsird - Fabrique avec fierte",
    success_title: "COMMANDE CONFIRMEE",
    success_text: "Un e-mail de confirmation te sera envoye. Ta commande part vers toi sous 48h.",
    about_heading: "A PROPOS",
    about_text: "Tramsird est ne d'une envie simple : porter fierement son heritage africain dans un vetement pense pour la rue d'aujourd'hui. Chaque piece est concue en petite serie, en melant coupes streetwear et motifs puises dans le wax. Fabrique avec soin, pense pour durer.",
    social_instagram: "",
    social_tiktok: "",
  };

  for (const [key, value] of Object.entries(defaultContent)) {
    await db.query(
      "INSERT INTO site_content (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING",
      [key, value]
    );
  }
  console.log("Contenu texte du site initialise");
}

module.exports = seed;
