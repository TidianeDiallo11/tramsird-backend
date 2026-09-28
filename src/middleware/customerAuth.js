const jwt = require("jsonwebtoken");

function requireCustomerAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Connexion requise." });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== "customer") throw new Error("invalid token type");
    req.customer = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Session invalide ou expiree, reconnecte-toi." });
  }
}

function optionalCustomerAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (payload.type === "customer") req.customer = payload;
    } catch (err) {
      // token invalide ou expire : on continue en invite, sans bloquer la commande
    }
  }
  next();
}

module.exports = { requireCustomerAuth, optionalCustomerAuth };
