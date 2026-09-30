const API_BASE = "/api";

function getToken() { return localStorage.getItem("tramsird_admin_token"); }
function setToken(t) { localStorage.setItem("tramsird_admin_token", t); }
function clearToken() { localStorage.removeItem("tramsird_admin_token"); }

async function apiFetch(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) {
    clearToken();
    showLogin();
    throw new Error("Session expiree.");
  }
  if (!res.ok) throw new Error(data.error || "Erreur inconnue.");
  return data;
}

function formatGNF(n) {
  return `${Math.round(n).toLocaleString("fr-FR")} GNF`;
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
    if (view === "preorders") loadPreorders();
    if (view === "promocodes") loadPromoCodes();
    if (view === "content") loadContent();
  });
});

async function loadDashboard() {
  try {
    const data = await apiFetch("/stats/dashboard");

    document.getElementById("stat-grid").innerHTML = `
      <div class="stat-card"><p class="stat-label">CHIFFRE D'AFFAIRES</p><p class="stat-value">${formatGNF(data.totalRevenue)}</p></div>
      <div class="stat-card"><p class="stat-label">COMMANDES PAYEES</p><p class="stat-value">${data.paidOrdersCount}</p></div>
      <div class="stat-card"><p class="stat-label">EN ATTENTE</p><p class="stat-value">${data.pendingOrdersCount}</p></div>
    `;

    const tbody = document.querySelector("#recent-orders-table tbody");
    tbody.innerHTML = data.recentOrders.map((o) => `
      <tr>
        <td>${o.customer_name}</td>
        <td>${formatGNF(o.total)}</td>
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

const CATEGORY_LABELS = {
  "t-shirts": "T-shirts",
  shorts: "Shorts",
  pantalons: "Pantalons",
  survetements: "Survetements",
  hoodies: "Hoodies",
  jerseys: "Jerseys",
  accessoires: "Accessoires",
};

async function loadProducts() {
  try {
    productsCache = await apiFetch("/products/admin/all");
    const tbody = document.querySelector("#products-table tbody");
    tbody.innerHTML = productsCache.map((p) => `
      <tr data-id="${p.id}">
        <td>${p.name}</td>
        <td>${CATEGORY_LABELS[p.category] || p.category || "-"}</td>
        <td>${formatGNF(p.price)}</td>
        <td>${p.stock}</td>
        <td>
          ${p.active ? '<span class="badge badge-paid">visible</span>' : '<span class="badge badge-cancelled">masque</span>'}
          ${p.featured ? '<span class="badge badge-processing">accueil</span>' : ""}
        </td>
        <td><button class="btn-secondary edit-product-btn" data-id="${p.id}">Modifier</button></td>
      </tr>
    `).join("") || `<tr><td colspan="6">Aucun produit. Clique sur "Nouveau produit" pour commencer.</td></tr>`;

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

const SIZE_LABELS = ["XS", "S", "M", "L", "XL", "2XL"];

function updateSizesStockVisibility() {
  const hasSizes = document.getElementById("product-has-sizes").checked;
  document.getElementById("product-sizes-wrap").hidden = !hasSizes;
  const stockInput = document.getElementById("product-stock");
  const stockWrap = document.getElementById("product-stock-wrap");
  stockInput.disabled = hasSizes;
  stockWrap.style.opacity = hasSizes ? 0.5 : 1;
}

document.getElementById("product-has-sizes").addEventListener("change", updateSizesStockVisibility);

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
    document.getElementById("product-category").value = p.category || "accessoires";
    document.getElementById("product-stock").value = p.stock;
    document.getElementById("product-images").value = (p.images && p.images.length ? p.images : (p.image_url ? [p.image_url] : [])).join("\n");
    document.getElementById("product-colors").value = (p.colors || []).map((c) => `${c.name}:${c.hex}`).join(",");
    document.getElementById("product-active").checked = !!p.active;
    document.getElementById("product-preorder").checked = !!p.preorder;
    document.getElementById("product-featured").checked = !!p.featured;

    const sizedEntries = (p.sizes || []).filter((s) => s && typeof s === "object");
    const hasSizes = sizedEntries.length > 0;
    document.getElementById("product-has-sizes").checked = hasSizes;
    SIZE_LABELS.forEach((label) => {
      const entry = sizedEntries.find((s) => s.size === label);
      document.getElementById(`size-stock-${label}`).value = entry ? entry.stock : 0;
    });
  } else {
    title.textContent = "Nouveau produit";
    document.getElementById("product-form").reset();
    document.getElementById("product-id").value = "";
    document.getElementById("product-active").checked = true;
    document.getElementById("product-preorder").checked = false;
    document.getElementById("product-featured").checked = false;
    document.getElementById("product-has-sizes").checked = false;
    SIZE_LABELS.forEach((label) => {
      document.getElementById(`size-stock-${label}`).value = 0;
    });
  }

  updateSizesStockVisibility();
  updateImagePreview();
  modal.hidden = false;
}

function getProductImageUrls() {
  return document.getElementById("product-images").value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function updateImagePreview() {
  const urls = getProductImageUrls();
  const wrap = document.getElementById("product-image-preview-wrap");
  if (!urls.length) {
    wrap.hidden = true;
    wrap.innerHTML = "";
    return;
  }
  wrap.hidden = false;
  wrap.innerHTML = urls.map((url, idx) => `
    <div class="image-preview-item">
      <img src="${url}" alt="Apercu ${idx + 1}" onerror="this.closest('.image-preview-item').style.display='none'" />
      ${idx === 0 ? '<span class="image-preview-main">Principale</span>' : ""}
      <button type="button" class="image-preview-remove" data-remove-image="${idx}" aria-label="Supprimer cette photo">&times;</button>
    </div>
  `).join("");

  wrap.querySelectorAll("[data-remove-image]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const removeIdx = Number(btn.dataset.removeImage);
      const remaining = getProductImageUrls().filter((_, i) => i !== removeIdx);
      document.getElementById("product-images").value = remaining.join("\n");
      updateImagePreview();
    });
  });
}

async function uploadImage(file) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/uploads`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) {
    clearToken();
    showLogin();
    throw new Error("Session expiree.");
  }
  if (!res.ok) throw new Error(data.error || "Echec de l'upload.");
  return data.url;
}

document.querySelectorAll("[data-upload-target]").forEach((btn) => {
  const targetKey = btn.dataset.uploadTarget;
  const fileInput = document.querySelector(`[data-upload-input="${targetKey}"]`);
  const isMultiple = btn.dataset.uploadMultiple === "1";

  btn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    const files = Array.from(fileInput.files || []);
    if (!files.length) return;

    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Upload en cours...";

    try {
      const urls = [];
      for (const file of files) {
        urls.push(await uploadImage(file));
      }

      if (isMultiple) {
        const textarea = document.getElementById(targetKey);
        const existing = textarea.value.split("\n").map((s) => s.trim()).filter(Boolean);
        textarea.value = [...existing, ...urls].join("\n");
        textarea.dispatchEvent(new Event("input"));
      } else {
        const input = document.getElementById(targetKey);
        input.value = urls[0];
        input.dispatchEvent(new Event("input"));
      }
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
      fileInput.value = "";
    }
  });
});

document.getElementById("product-images").addEventListener("input", updateImagePreview);
document.getElementById("new-product-btn").addEventListener("click", () => openProductModal(null));
document.getElementById("product-cancel-btn").addEventListener("click", () => {
  document.getElementById("product-modal").hidden = true;
});

document.getElementById("product-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("product-error");
  errorEl.hidden = true;

  const id = document.getElementById("product-id").value;
  const hasSizes = document.getElementById("product-has-sizes").checked;
  const sizes = hasSizes
    ? SIZE_LABELS.map((label) => ({
        size: label,
        stock: Number(document.getElementById(`size-stock-${label}`).value) || 0,
      }))
    : [];
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
    category: document.getElementById("product-category").value,
    stock: hasSizes
      ? sizes.reduce((sum, s) => sum + s.stock, 0)
      : Number(document.getElementById("product-stock").value),
    images: getProductImageUrls(),
    sizes,
    colors,
    active: document.getElementById("product-active").checked,
    preorder: document.getElementById("product-preorder").checked,
    featured: document.getElementById("product-featured").checked,
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
        <td>${formatGNF(o.total)}</td>
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
    <div class="order-line"><span>Total</span><span>${formatGNF(order.total)}</span></div>
    <br/>
    ${order.items.map((i) => `
      <div class="order-line"><span>${i.name} - ${i.color}, ${i.size} x${i.qty}</span><span>${formatGNF(i.unit_price * i.qty)}</span></div>
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

let preordersCache = [];
let selectedPreorderId = null;

function preorderStatusBadge(status) {
  const labels = { pending: "en attente", paid: "payee", cancelled: "annulee" };
  const badgeClass = status === "paid" ? "badge-paid" : status === "cancelled" ? "badge-cancelled" : "badge-new";
  return `<span class="badge ${badgeClass}">${labels[status] || status}</span>`;
}

async function loadPreorders() {
  try {
    preordersCache = await apiFetch("/preorders");
    const tbody = document.querySelector("#preorders-table tbody");
    tbody.innerHTML = preordersCache.map((p) => `
      <tr data-id="${p.id}">
        <td>${p.customer_name}</td>
        <td>${p.customer_email}<br/><span style="color: var(--text-muted)">${p.customer_phone || "-"}</span></td>
        <td>${p.items.reduce((s, i) => s + i.qty, 0)} article(s)</td>
        <td>${preorderStatusBadge(p.status)}</td>
        <td>${formatDate(p.created_at)}</td>
      </tr>
    `).join("") || `<tr><td colspan="5">Aucune precommande pour le moment.</td></tr>`;

    tbody.querySelectorAll("tr[data-id]").forEach((row) => {
      row.addEventListener("click", () => openPreorderModal(row.dataset.id));
    });
  } catch (err) {
    console.error(err);
  }
}

function openPreorderModal(id) {
  const preorder = preordersCache.find((p) => p.id === id);
  if (!preorder) return;
  selectedPreorderId = id;

  const content = document.getElementById("preorder-detail-content");
  content.innerHTML = `
    <div class="order-line"><span>Client</span><span>${preorder.customer_name}</span></div>
    <div class="order-line"><span>Email</span><span>${preorder.customer_email}</span></div>
    <div class="order-line"><span>Telephone</span><span>${preorder.customer_phone || "-"}</span></div>
    <div class="order-line"><span>Adresse</span><span>${preorder.shipping_address || "-"}</span></div>
    <br/>
    ${preorder.items.map((i) => `
      <div class="order-line"><span>${i.name} - ${i.color || "-"}, ${i.size || "-"} x${i.qty}</span><span>${formatGNF(i.unit_price * i.qty)}</span></div>
    `).join("")}
  `;

  document.getElementById("preorder-paid-cb").checked = preorder.status === "paid";
  document.getElementById("preorder-cancelled-cb").checked = preorder.status === "cancelled";
  document.getElementById("preorder-modal").hidden = false;
}

document.getElementById("preorder-modal-close-btn").addEventListener("click", () => {
  document.getElementById("preorder-modal").hidden = true;
});

async function updatePreorderStatus(status) {
  try {
    await apiFetch(`/preorders/${selectedPreorderId}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
    await loadPreorders();
    const preorder = preordersCache.find((p) => p.id === selectedPreorderId);
    if (preorder) {
      document.getElementById("preorder-paid-cb").checked = preorder.status === "paid";
      document.getElementById("preorder-cancelled-cb").checked = preorder.status === "cancelled";
    }
  } catch (err) {
    alert(err.message);
  }
}

document.getElementById("preorder-paid-cb").addEventListener("change", (e) => {
  updatePreorderStatus(e.target.checked ? "paid" : "pending");
});

document.getElementById("preorder-cancelled-cb").addEventListener("change", (e) => {
  updatePreorderStatus(e.target.checked ? "cancelled" : "pending");
});

let promoCodesCache = [];

function formatPromoValue(p) {
  return p.type === "percent" ? `${p.value}%` : formatGNF(p.value);
}

async function loadPromoCodes() {
  try {
    promoCodesCache = await apiFetch("/promocodes");
    const tbody = document.querySelector("#promocodes-table tbody");
    tbody.innerHTML = promoCodesCache.map((p) => `
      <tr data-id="${p.id}">
        <td><strong>${p.code}</strong></td>
        <td>${formatPromoValue(p)}</td>
        <td>${p.used_count}${p.max_uses != null ? ` / ${p.max_uses}` : ""}</td>
        <td>${p.expires_at ? formatDate(p.expires_at) : "-"}</td>
        <td>${p.active ? '<span class="badge badge-paid">actif</span>' : '<span class="badge badge-cancelled">inactif</span>'}</td>
        <td>
          <button class="btn-secondary edit-promo-btn" data-id="${p.id}">Modifier</button>
          <button class="btn-secondary delete-promo-btn" data-id="${p.id}">Supprimer</button>
        </td>
      </tr>
    `).join("") || `<tr><td colspan="6">Aucun code promo. Clique sur "Nouveau code" pour commencer.</td></tr>`;

    document.querySelectorAll(".edit-promo-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openPromoModal(btn.dataset.id);
      });
    });
    document.querySelectorAll(".delete-promo-btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("Supprimer ce code promo ?")) return;
        try {
          await apiFetch(`/promocodes/${btn.dataset.id}`, { method: "DELETE" });
          loadPromoCodes();
        } catch (err) {
          alert(err.message);
        }
      });
    });
  } catch (err) {
    console.error(err);
  }
}

function openPromoModal(id) {
  const modal = document.getElementById("promo-modal");
  const title = document.getElementById("promo-modal-title");
  const errorEl = document.getElementById("promo-error");
  errorEl.hidden = true;

  if (id) {
    const p = promoCodesCache.find((x) => x.id === id);
    title.textContent = "Modifier le code promo";
    document.getElementById("promo-id").value = p.id;
    document.getElementById("promo-code").value = p.code;
    document.getElementById("promo-code").disabled = true;
    document.getElementById("promo-type").value = p.type;
    document.getElementById("promo-value").value = p.value;
    document.getElementById("promo-max-uses").value = p.max_uses != null ? p.max_uses : "";
    document.getElementById("promo-expires-at").value = p.expires_at ? p.expires_at.slice(0, 10) : "";
    document.getElementById("promo-active").checked = !!p.active;
  } else {
    title.textContent = "Nouveau code promo";
    document.getElementById("promo-form").reset();
    document.getElementById("promo-id").value = "";
    document.getElementById("promo-code").disabled = false;
    document.getElementById("promo-active").checked = true;
  }

  modal.hidden = false;
}

document.getElementById("new-promo-btn").addEventListener("click", () => openPromoModal(null));
document.getElementById("promo-cancel-btn").addEventListener("click", () => {
  document.getElementById("promo-modal").hidden = true;
});

document.getElementById("promo-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("promo-error");
  errorEl.hidden = true;

  const id = document.getElementById("promo-id").value;
  const maxUsesRaw = document.getElementById("promo-max-uses").value;
  const expiresAtRaw = document.getElementById("promo-expires-at").value;

  const payload = {
    code: document.getElementById("promo-code").value,
    type: document.getElementById("promo-type").value,
    value: Number(document.getElementById("promo-value").value),
    maxUses: maxUsesRaw ? Number(maxUsesRaw) : null,
    expiresAt: expiresAtRaw || null,
    active: document.getElementById("promo-active").checked,
  };

  try {
    if (id) {
      await apiFetch(`/promocodes/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await apiFetch("/promocodes", { method: "POST", body: JSON.stringify(payload) });
    }
    document.getElementById("promo-modal").hidden = true;
    loadPromoCodes();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
});

function renderSingleImagePreview(key) {
  const input = document.getElementById(key);
  const wrap = document.getElementById(`${key}-preview`);
  if (!input.value) {
    wrap.hidden = true;
    wrap.innerHTML = "";
    return;
  }
  wrap.hidden = false;
  wrap.innerHTML = `
    <div class="image-preview-item">
      <img src="${input.value}" alt="Apercu" onerror="this.closest('.image-preview-item').style.display='none'" />
      <button type="button" class="image-preview-remove" data-clear-image="${key}" aria-label="Supprimer cette photo">&times;</button>
    </div>
  `;
  wrap.querySelector("[data-clear-image]").addEventListener("click", () => {
    input.value = "";
    input.dispatchEvent(new Event("input"));
  });
}

document.getElementById("header_logo_url").addEventListener("input", () => renderSingleImagePreview("header_logo_url"));
document.getElementById("hero_image_url").addEventListener("input", () => renderSingleImagePreview("hero_image_url"));

async function loadContent() {
  try {
    const content = await apiFetch("/content");
    document.querySelectorAll("#content-form [data-key]").forEach((el) => {
      const key = el.dataset.key;
      if (content[key] !== undefined) el.value = content[key];
    });
    renderSingleImagePreview("header_logo_url");
    renderSingleImagePreview("hero_image_url");
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
