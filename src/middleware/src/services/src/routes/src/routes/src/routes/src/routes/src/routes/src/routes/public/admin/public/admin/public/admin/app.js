const API_BASE = "/api";

// ---------------------------------------------------------------------------
// UTILITAIRES
// ---------------------------------------------------------------------------
function getToken() { return localStorage.getItem("tramsird_admin_token"); }
function setToken(t) { localStorage.setItem("tramsird_admin_token", t); }
function clearToken() { localStorage.removeItem("tramsird_admin_token"); }

async function apiFetch(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    clearToken();
    showLogin();
    throw new Error("Session expirée.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erreur inconnue.");
  return data;
}

function formatFCFA(n) {
  return `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
}
function formatDate(iso) {
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function statusBadge(status) {
  return `<span class="badge badge-${status}">${status}</span>`;
}

// ---------------------------------------------------------------------------
// AUTH / ÉCRANS
// ---------------------------------------------------------------------------
function showLogin() {
  document.getElementById("login-screen").hidden = false;
  document.getElementById("app").hidden = true;
}
function showApp() {
  document.getElementById("login-screen").hidden = true;
  document.getElementById("app").hidden = false;
  loadDashboard();
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  const errorEl = document.getElementById("login-error");
  errorEl.hidden = true;

  try {
    const data = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    showApp();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
});

document.getElementById("logout-btn").addEventListener("click", () => {
  clearToken();
  showLogin();
});

// Vérifie si une session existe déjà au chargement
(async function init() {
  if (getToken()) {
    try {
      await apiFetch("/auth/me");
      showApp();
    } catch {
      showLogin();
    }
  } else {
    showLogin();
  }
})();

// ---------------------------------------------------------------------------
// NAVIGATION
// ---------------------------------------------------------------------------
document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".view").forEach((v) => (v.hidden = true));
    const view = btn.dataset.view;
    document.getElementById(`view-${view}`).hidden = false;
    if (view === "dashboard") loadDashboard();
    if (view === "products") loadProducts();
    if (view === "orders") loadOrders();
    if (view === "content") loadContent();
  });
});

// ---------------------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------------------
async function loadDashboard() {
  try {
    const data = await apiFetch("/stats/dashboard");

    document.getElementById("stat-grid").innerHTML = `
      <div class="stat-card"><p class="stat-label">CHIFFRE D'AFFAIRES</p><p class="stat-value">${formatFCFA(data.totalRevenue)}</p></div>
      <div class="stat-card"><p class="stat-label">COMMANDES PAYÉES</p><p class="stat-value">${data.paidOrdersCount}</p></div>
      <div class="stat-card"><p class="stat-label">EN ATTENTE</p><p class="stat-value">${data.pendingOrdersCount}</p></div>
    `;

    const tbody = document.querySelector("#recent-orders-table tbody");
    tbody.innerHTML = data.recentOrders.map((o) => `
      <tr>
        <td>${o.customer_name}</td>
        <td>${formatFCFA(o.total)}</td>
        <td>${statusBadge(o.payment_status)}</td>
        <td>${statusBadge(o.status)}</td>
        <td>${formatDate(o.created_at)}</td>
      </tr>
    `).join("") || `<tr><td colspan="5">Aucune commande pour le moment.</td></tr>`;

    const lowStockPanel = document.getElementById("low-stock-panel");
    if (data.lowStockProducts.length > 0) {
      lowStockPanel.hidden = false;
      document.getElementById("low-stock-list").innerHTML = data.lowStockProducts
        .map((p) => `<li>${p.name} — ${p.stock} restant(s)</li>`)
        .join("");
    } else {
      lowStockPanel.hidden = true;
    }
  } catch (err) {
    console.error(err);
  }
}

// ---------------------------------------------------------------------------
// PRODUITS
// ---------------------------------------------------------------------------
let productsCache = [];

async function loadProducts() {
  try {
    productsCache = await apiFetch("/products/admin/all");
    const tbody = document.querySelector("#products-table tbody");
    tbody.innerHTML = productsCache.map((p) => `
      <tr data-id="${p.id}">
        <td>${p.name}</td>
        <td>${formatFCFA(p.price)}</td>
        <td>${p.stock}</td>
        <td>${p.active ? '<span class="badge badge-paid">visible</span>' : '<span class="badge badge-cancelled">masqué</span>'}</td>
        <td><button class="btn-secondary edit-product-btn" data-id="${p.id}">Modifier</button></td>
      </tr>
    `).join("") || `<tr><td colspan="5">Aucun produit. Clique sur "Nouveau produit" pour commencer.</td></tr>`;

    document.querySelectorAll(".edit-product-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openProductModal(btn.dataset.id);
      });
    });
  } catch (err) {
    console.error(err);
  }
}

function openProductModal(id) {
  const modal = document.getElementById("product-modal");
  const title = document.getElementById("product-modal-title");
  const errorEl = document.getElementById("product-error");
  errorEl.hidden = true;

  if (id) {
    const p = productsCache.find((x) => x.id === id);
    title.textContent = "Modifier le produit";
    document.getElementById("product-id").value = p.id;
    document.getElementById("product-name").value = p.name;
    document.getElementById("product-tagline").value = p.tagline || "";
    document.getElementById("product-description").value = p.description || "";
    document.getElementById("product-price").value = p.price;
    document.getElementById("product-stock").value = p.stock;
    document.getElementById("product-sizes").value = (p.sizes || []).join(",");
    document.getElementById("product-colors").value = (p.colors || []).map((c) => `${c.name}:${c.hex}`).join(",");
    document.getElementById("product-active").checked = !!p.active;
  } else {
    title.textContent = "Nouveau produit";
    document.getElementById("product-form").reset();
    document.getElementById("product-id").value = "";
    document.getElementById("product-active").checked = true;
  }

  modal.hidden = false;
}

document.getElementById("new-product-btn").addEventListener("click", () => openProductModal(null));
document.getElementById("product-cancel-btn").addEventListener("click", () => {
  document.getElementById("product-modal").hidden = true;
});

document.getElementById("product-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("product-error");
  errorEl.hidden = true;

  const id = document.getElementById("product-id").value;
  const sizes = document.getElementById("product-sizes").value
    .split(",").map((s) => s.trim()).filter(Boolean);
  const colors = document.getElementById("product-colors").value
    .split(",").map((s) => s.trim()).filter(Boolean)
    .map((pair) => {
      const [name, hex] = pair.split(":").map((x) => x.trim());
      return { name, hex: hex || "#C4562B" };
    });

  const payload = {
    name: document.getElementById("product-name").value,
    tagline: document.getElementById("product-tagline").value,
    description: document.getElementById("product-description").value,
    price: Number(document.getElementById("product-price").value),
    stock: Number(document.getElementById("product-stock").value),
    sizes,
    colors,
    active: document.getElementById("product-active").checked,
  };

  try {
    if (id) {
      await apiFetch(`/products/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await apiFetch("/products", { method: "POST", body: JSON.stringify(payload) });
    }
    document.getElementById("product-modal").hidden = true;
    loadProducts();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
});

// ---------------------------------------------------------------------------
// COMMANDES
// ---------------------------------------------------------------------------
let ordersCache = [];
let selectedOrderId = null;

async function loadOrders() {
  const filter = document.getElementById("order-filter").value;
  try {
    const query = filter ? `?status=${filter}` : "";
    ordersCache = await apiFetch(`/orders${query}`);
    const tbody = document.querySelector("#orders-table tbody");
    tbody.innerHTML = ordersCache.map((o) => `
      <tr data-id="${o.id}">
        <td>${o.customer_name}</td>
        <td>${o.items.reduce((s, i) => s + i.qty, 0)} article(s)</td>
        <td>${formatFCFA(o.total)}</td>
        <td>${statusBadge(o.payment_status)}</td>
        <td>${statusBadge(o.status)}</td>
        <td>${formatDate(o.created_at)}</td>
      </tr>
    `).join("") || `<tr><td colspan="6">Aucune commande.</td></tr>`;

    tbody.querySelectorAll("tr[data-id]").forEach((row) => {
      row.addEventListener("click", () => openOrderModal(row.dataset.id));
    });
  } catch (err) {
    console.error(err);
  }
}

document.getElementById("order-filter").addEventListener("change", loadOrders);

function openOrderModal(id) {
  const order = ordersCache.find((o) => o.id === id);
  if (!order) return;
  selectedOrderId = id;

  const content = document.getElementById("order-detail-content");
  content.innerHTML = `
    <div class="order-line"><span>Client</span><span>${order.customer_name}</span></div>
    <div class="order-line"><span>Email</span><span>${order.customer_
