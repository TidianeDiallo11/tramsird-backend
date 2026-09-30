const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");
const db = require("./init");

async function seed() {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@tramsird.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "changeme123";

  const existingAdmin = await db.one("SELECT id FROM admins WHERE email = $1", [adminEmail]);
  const hash = bcrypt.hashSync(adminPassword, 10);
  if (!existingAdmin) {
    await db.query("INSERT INTO admins (id, email, password_hash) VALUES ($1, $2, $3)", [
      uuidv4(),
      adminEmail,
      hash,
    ]);
    console.log(`Compte admin cree : ${adminEmail}`);
  } else {
    await db.query("UPDATE admins SET password_hash = $1 WHERE id = $2", [hash, existingAdmin.id]);
    console.log(`Mot de passe admin synchronise avec ADMIN_PASSWORD : ${adminEmail}`);
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
    home_eyebrow: "GUINEA IS OURS · FCTW",
    home_title_line1: "PORTE",
    home_title_line2: "TON",
    home_title_line3: "HERITAGE",
    home_subtitle: "Tramsird cree depuis la Guinee, avec ses propres references. Coupes larges, motifs puises dans le wax, fabrique en petites series.",
    collection_heading: "LA COLLECTION",
    feature_1_label: "01 - MATIERE",
    feature_1_text: "Molleton 380g, brode main",
    feature_2_label: "02 - LIVRAISON",
    feature_2_text: "Expedie sous 48h, suivi inclus",
    feature_3_label: "03 - PAIEMENT",
    feature_3_text: "Carte bancaire, PayPal ou Orange Money",
    values_heading: "NOS VALEURS",
    value_1_title: "UNION",
    value_1_text: "Le projet se construit a plusieurs : la complementarite des talents compte plus que le culte d'une seule personne.",
    value_2_title: "DEVOTION",
    value_2_text: "Une ambition forte n'a de valeur que suivie de travail, de constance et d'une attention reelle a l'execution.",
    value_3_title: "OBJECTIVITE",
    value_3_text: "Regarder nos forces comme nos faiblesses : mesurer, corriger et progresser plutot que romantiser le fait d'etre une marque locale.",
    slogan_signature: "GUINEA IS OURS. — FROM CONAKRY TO THE WORLD",
    footer_text: "2026 Tramsird - Fabrique avec fierte",
    success_title: "COMMANDE CONFIRMEE",
    success_text: "Un e-mail de confirmation te sera envoye. Ta commande part vers toi sous 48h.",
    about_heading: "NOTRE HISTOIRE",
    about_text: "Nous ne sommes pas nes de l'envie de reproduire une marque etrangere en Guinee, mais de creer depuis la Guinee, avec nos propres references.\n\nLe vetement reste l'un de nos terrains d'expression, mais nous developpons aussi des experiences culturelles et evenementielles : BLACK OUT, BLACK OUT LEVEL UP ou FUN HOUSE en sont l'illustration. Nous ne sommes pas qu'a la recherche de profits en vendant nos produits, car nous avons pour obligation principale de reaffirmer la grandeur de notre continent.\n\nNotre vision : participer a l'emergence d'un continent capable de creer, produire et faire circuler davantage ses propres references culturelles, creatives et economiques. L'autosuffisance d'un continent ne depend evidemment pas d'une marque de vetements : notre role est de contribuer, a notre echelle, a une culture de creation, de propriete, de production et de confiance dans ce qui vient d'ici.\n\nGUINEA IS OURS. — FROM CONAKRY TO THE WORLD.",
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
