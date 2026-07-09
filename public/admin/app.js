const API_BASE = "/api";

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
    throw new Error("Session expiree.");
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

async function loadDashboard() {
  try {
    const data = await apiFetch("/stats/dashboard");

    document.getElementById("stat-grid").innerHTML = `
      <div class="stat-card"><p class="stat-label">CHIFFRE D'AFFAIRES</p><p class="stat-value">${formatFCFA(data.totalRevenue)}</p></div>
      <div class="stat-card"><p class="stat-label">COMMANDES PAYEES</p><p class="stat-value">${data.paidOrdersCount}</p></div>
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
        .map((p) => `<li>${p.name} - ${p.stock} restant(s)</li>`)
        .join("");
    } else {
      lowStockPanel.hidden = true;
    }
  } catch (err) {
    console.error(err);
  }
}

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
        <td>${p.active ? '<span class="badge badge-paid">visible</span>' : '<span class="badge badge-cancelled">masque</span>'}</td>
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
    document.getElementById("product-image-url").value = p.image_url || "";
    document.getElementById("product-sizes").value = (p.sizes || []).join(",");
    document.getElementById("product-colors").value = (p.colors || []).map((c) => `${c.name}:${c.hex}`).join(",");
    document.getElementById("product-active").checked = !!p.active;
  } else {
    title.textContent = "Nouveau produit";
    document.getElementById("product-form").reset();
    document.getElementById("product-id").value = "";
    document.getElementById("product-active").checked = true;
  }

  updateImagePreview();
  modal.hidden = false;
}

function updateImagePreview() {
  const url = document.getElementById("product-image-url").value.trim();
  const wrap = document.getElementById("product-image-preview-wrap");
  const img = document.getElementById("product-image-preview");
  if (url) {
    img.src = url;
    wrap.hidden = false;
  } else {
    wrap.hidden = true;
    img.src = "";
  }
}

document.getElementById("product-image-url").addEventListener("input", updateImagePreview);
document.getElementById("product-image-preview").addEventListener("error", () => {
  document.getElementById("product-image-preview-wrap").hidden = true;
});
document.getElementById("product-image-preview").addEventListener("load", () => {
  document.getElementById("product-image-preview-wrap").hidden = false;
});
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
    image_url: document.getElementById("product-image-url").value.trim() || null,
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
    <div class="order-line"><span>Email</span><span>${order.customer_email}</span></div>
    <div class="order-line"><span>Telephone</span><span>${order.customer_phone || "-"}</span></div>
    <div class="order-line"><span>Adresse</span><span>${order.shipping_address || "-"}</span></div>
    <div class="order-line"><span>Paiement</span><span>${order.payment_method || "-"} (${order.payment_status})</span></div>
    <div class="order-line"><span>Total</span><span>${formatFCFA(order.total)}</span></div>
    <br/>
    ${order.items.map((i) => `
      <div class="order-line"><span>${i.name} - ${i.color}, ${i.size} x${i.qty}</span><span>${formatFCFA(i.unit_price * i.qty)}</span></div>
    `).join("")}
  `;

  document.getElementById("order-status-select").value = order.status;
  document.getElementById("order-modal").hidden = false;
}

document.getElementById("order-modal-close-btn").addEventListener("click", () => {
  document.getElementById("order-modal").hidden = true;
});

document.getElementById("order-status-save-btn").addEventListener("click", async () => {
  const status = document.getElementById("order-status-select").value;
  try {
    await apiFetch(`/orders/${selectedOrderId}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
    document.getElementById("order-modal").hidden = true;
    loadOrders();
  } catch (err) {
    alert(err.message);
  }
});

async function loadContent() {
  try {
    const content = await apiFetch("/content");
    document.querySelectorAll("#content-form [data-key]").forEach((el) => {
      const key = el.dataset.key;
      if (content[key] !== undefined) el.value = content[key];
    });
    updatePreview();
  } catch (err) {
    console.error(err);
  }
}

function updatePreview() {
  const get = (key) => {
    const el = document.querySelector(`#content-form [data-key="${key}"]`);
    return el ? el.value : "";
  };
  document.getElementById("preview-eyebrow").textContent = get("home_eyebrow");
  document.getElementById("preview-line1").textContent = get("home_title_line1");
  document.getElementById("preview-line2").textContent = get("home_title_line2");
  document.getElementById("preview-line3").textContent = get("home_title_line3");
  document.getElementById("preview-subtitle").textContent = get("home_subtitle");
}

document.querySelectorAll("#content-form [data-key]").forEach((el) => {
  el.addEventListener("input", updatePreview);
});

document.getElementById("save-content-btn").addEventListener("click", async () => {
  const payload = {};
  document.querySelectorAll("#content-form [data-key]").forEach((el) => {
    payload[el.dataset.key] = el.value;
  });

  try {
    await apiFetch("/content", { method: "PUT", body: JSON.stringify(payload) });
    const msg = document.getElementById("content-saved-msg");
    msg.hidden = false;
    setTimeout(() => { msg.hidden = true; }, 3000);
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById("account-btn").addEventListener("click", () => {
  document.getElementById("password-form").reset();
  document.getElementById("password-error").hidden = true;
  document.getElementById("password-success").hidden = true;
  document.getElementById("account-modal").hidden = false;
});

document.getElementById("account-cancel-btn").addEventListener("click", () => {
  document.getElementById("account-modal").hidden = true;
});

document.getElementById("password-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("password-error");
  const successEl = document.getElementById("password-success");
  errorEl.hidden = true;
  successEl.hidden = true;

  const currentPassword = document.getElementById("current-password").value;
  const newPassword = document.getElementById("new-password").value;
  const confirmPassword = document.getElementById("confirm-password").value;

  if (newPassword !== confirmPassword) {
    errorEl.textContent = "Les deux nouveaux mots de passe ne correspondent pas.";
    errorEl.hidden = false;
    return;
  }

  try {
    await apiFetch("/auth/password", {
      method: "PUT",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    successEl.hidden = false;
    document.getElementById("password-form").reset();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
});
