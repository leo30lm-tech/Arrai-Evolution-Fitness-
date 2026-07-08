/* =========================================================================
   ARRAIÁ DA EVOLUTION FITNESS STUDIO — SCRIPT.JS
   Organização:
     1. Constantes e chaves de armazenamento
     2. Utilitários
     3. Camada de dados (DataStore) — pronta para trocar LocalStorage por Supabase
     4. Estado em memória
     5. Renderização — formulário e itens
     6. Fluxo do participante
     7. Painel administrativo (auth, itens, participantes, dashboard)
     8. Inicialização e PWA
   ========================================================================= */

(function () {
  "use strict";

  /* =======================================================================
     1. CONSTANTES
     ======================================================================= */
  const STORAGE_KEYS = {
    ITEMS: "efs_junina_items_v1",
    PARTICIPANTS: "efs_junina_participants_v1",
    CURRENT_PARTICIPANT: "efs_junina_current_participant_v1",
    ADMIN_HASH: "efs_junina_admin_hash_v1"
  };

  const DEFAULT_ADMIN_PASSWORD = "evolution2026";

  const DEFAULT_ITEMS = [
    { name: "Refrigerante", needed: 10 },
    { name: "Suco", needed: 8 },
    { name: "Água", needed: 10 },
    { name: "Canjica", needed: 2 },
    { name: "Pipoca", needed: 3 },
    { name: "Paçoca", needed: 5 },
    { name: "Pé de Moleque", needed: 5 },
    { name: "Bolo", needed: 6 },
    { name: "Milho", needed: 15 },
    { name: "Cachorro-Quente", needed: 3 },
    { name: "Salsicha", needed: 5 },
    { name: "Pão", needed: 5 },
    { name: "Molho", needed: 3 },
    { name: "Pratos", needed: 5 },
    { name: "Copos", needed: 5 },
    { name: "Guardanapos", needed: 5 },
    { name: "Talheres", needed: 5 },
    { name: "Gelo", needed: 8 },
    { name: "Carvão", needed: 4 },
    { name: "Outro", needed: 10 }
  ];

  /* =======================================================================
     2. UTILITÁRIOS
     ======================================================================= */
  function generateId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  }

  function slugify(text) {
    return text
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function formatDateTime(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  async function sha256Hex(text) {
    const encoded = new TextEncoder().encode(text);
    const digest = await window.crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function showToast(message, type) {
    const container = document.getElementById("toastContainer");
    const toast = document.createElement("div");
    toast.className = "toast" + (type === "error" ? " toast-error" : "");
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 200ms ease";
      setTimeout(() => toast.remove(), 220);
    }, 2800);
  }

  /* =======================================================================
     3. CAMADA DE DADOS (DataStore)
     -----------------------------------------------------------------------
     Toda a persistência passa por aqui. As funções retornam Promises
     propositalmente: hoje o "backend" é o LocalStorage, mas no futuro
     basta reescrever o corpo destas funções para chamar o Supabase
     (ex: supabase.from('items').select()) sem alterar o restante do app.
     ======================================================================= */
  const DataStore = {
    async init() {
      if (!localStorage.getItem(STORAGE_KEYS.ITEMS)) {
        const seeded = DEFAULT_ITEMS.map((item) => ({
          id: slugify(item.name) + "-" + generateId().slice(0, 4),
          name: item.name,
          needed: item.needed
        }));
        localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(seeded));
      }
      if (!localStorage.getItem(STORAGE_KEYS.PARTICIPANTS)) {
        localStorage.setItem(STORAGE_KEYS.PARTICIPANTS, JSON.stringify([]));
      }
      if (!localStorage.getItem(STORAGE_KEYS.ADMIN_HASH)) {
        const hash = await sha256Hex(DEFAULT_ADMIN_PASSWORD);
        localStorage.setItem(STORAGE_KEYS.ADMIN_HASH, hash);
      }
    },

    async getItems() {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.ITEMS) || "[]");
    },
    async saveItems(items) {
      localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(items));
      return true;
    },

    async getParticipants() {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.PARTICIPANTS) || "[]");
    },
    async saveParticipants(list) {
      localStorage.setItem(STORAGE_KEYS.PARTICIPANTS, JSON.stringify(list));
      return true;
    },

    async getCurrentParticipantId() {
      return localStorage.getItem(STORAGE_KEYS.CURRENT_PARTICIPANT) || null;
    },
    async setCurrentParticipantId(id) {
      if (id) localStorage.setItem(STORAGE_KEYS.CURRENT_PARTICIPANT, id);
      else localStorage.removeItem(STORAGE_KEYS.CURRENT_PARTICIPANT);
      return true;
    },

    async getAdminHash() {
      return localStorage.getItem(STORAGE_KEYS.ADMIN_HASH);
    },
    async setAdminHash(hash) {
      localStorage.setItem(STORAGE_KEYS.ADMIN_HASH, hash);
      return true;
    }
  };

  /* =======================================================================
     4. ESTADO EM MEMÓRIA
     ======================================================================= */
  const State = {
    items: [],
    participants: [],
    currentParticipantId: null
  };

  function getCurrentParticipant() {
    if (!State.currentParticipantId) return null;
    return State.participants.find((p) => p.id === State.currentParticipantId) || null;
  }

  function computeItemStats(item) {
    const chosen = State.participants.filter((p) => p.attending === "sim" && p.itemId === item.id).length;
    const remaining = Math.max(item.needed - chosen, 0);
    const percent = item.needed > 0 ? Math.min(100, Math.round((chosen / item.needed) * 100)) : 100;
    const isFull = chosen >= item.needed;
    return { chosen, remaining, percent, isFull };
  }

  /* =======================================================================
     5. RENDERIZAÇÃO — ITENS
     ======================================================================= */
  function renderItemsGrid() {
    const grid = document.getElementById("itemsGrid");
    grid.innerHTML = "";
    const current = getCurrentParticipant();

    State.items.forEach((item) => {
      const stats = computeItemStats(item);
      const isMine = !!current && current.itemId === item.id;

      const card = document.createElement("article");
      card.className = "item-card";
      card.dataset.itemId = item.id;

      const badge = isMine
        ? '<span class="badge badge-selected">Selecionado</span>'
        : stats.isFull
        ? '<span class="badge badge-sold">Esgotado</span>'
        : "";

      const disabled = !current || current.attending !== "sim" || (stats.isFull && !isMine);
      const buttonLabel = isMine ? "Selecionado" : stats.isFull ? "Esgotado" : "Escolher";

      card.innerHTML = `
        <div class="item-card-header">
          <h3>${escapeHtml(item.name)}</h3>
          ${badge}
        </div>
        <div class="item-card-meta">
          <span>Necessário: <strong>${item.needed}</strong></span>
          <span>Escolhido: <strong>${stats.chosen}</strong></span>
          <span>Restante: <strong>${stats.remaining}</strong></span>
        </div>
        <div class="progress-track">
          <div class="progress-fill ${stats.isFull ? "is-full" : ""}" style="width:${stats.percent}%"></div>
        </div>
        <button type="button" class="btn btn-choose ${isMine ? "is-selected" : ""}" data-item-id="${item.id}" ${disabled ? "disabled" : ""}>
          ${buttonLabel}
        </button>
      `;

      grid.appendChild(card);
    });

    grid.querySelectorAll(".btn-choose").forEach((btn) => {
      btn.addEventListener("click", () => chooseItem(btn.dataset.itemId));
    });
  }

  async function chooseItem(itemId) {
    const current = getCurrentParticipant();
    if (!current || current.attending !== "sim") {
      showToast("Confirme sua presença antes de escolher um item.", "error");
      return;
    }
    const item = State.items.find((i) => i.id === itemId);
    if (!item) return;

    const stats = computeItemStats(item);
    if (stats.isFull && current.itemId !== itemId) {
      showToast("Este item já atingiu a quantidade necessária.", "error");
      return;
    }

    current.itemId = item.id;
    current.itemName = item.name;
    current.updatedAt = nowISO();

    await DataStore.saveParticipants(State.participants);
    renderItemsGrid();
    showToast(`Item reservado: ${item.name}`);
  }

  /* =======================================================================
     6. FLUXO DO PARTICIPANTE
     ======================================================================= */
  function toggleSectionsByAttendance(attending) {
    const itemsSection = document.getElementById("itemsSection");
    const notAttendingNote = document.getElementById("notAttendingNote");
    if (attending === "sim") {
      itemsSection.hidden = false;
      notAttendingNote.hidden = true;
    } else if (attending === "nao") {
      itemsSection.hidden = true;
      notAttendingNote.hidden = false;
    } else {
      itemsSection.hidden = true;
      notAttendingNote.hidden = true;
    }
  }

  function fillFormFromParticipant(participant) {
    if (!participant) return;
    document.getElementById("fullName").value = participant.name || "";
    document.getElementById("phone").value = participant.phone || "";
    document.getElementById("companions").value = participant.companions ?? 0;
    document.getElementById("note").value = participant.note || "";
    const radio = document.querySelector(`input[name="attending"][value="${participant.attending}"]`);
    if (radio) radio.checked = true;
  }

  async function handleParticipantFormSubmit(event) {
    event.preventDefault();

    const name = document.getElementById("fullName").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const attendingInput = document.querySelector('input[name="attending"]:checked');
    const companions = parseInt(document.getElementById("companions").value, 10) || 0;
    const note = document.getElementById("note").value.trim();
    const statusEl = document.getElementById("formStatus");

    if (name.length < 3) {
      statusEl.textContent = "Informe seu nome completo.";
      return;
    }
    if (!phone) {
      statusEl.textContent = "Informe um telefone para contato.";
      return;
    }
    if (!attendingInput) {
      statusEl.textContent = "Selecione se você participará.";
      return;
    }
    const attending = attendingInput.value;

    let participant = getCurrentParticipant();
    const isNew = !participant;

    if (isNew) {
      participant = {
        id: generateId(),
        name,
        phone,
        attending,
        companions,
        note,
        itemId: null,
        itemName: null,
        createdAt: nowISO(),
        updatedAt: nowISO()
      };
      State.participants.push(participant);
      State.currentParticipantId = participant.id;
      await DataStore.setCurrentParticipantId(participant.id);
    } else {
      participant.name = name;
      participant.phone = phone;
      participant.attending = attending;
      participant.companions = companions;
      participant.note = note;
      participant.updatedAt = nowISO();
      if (attending === "nao") {
        participant.itemId = null;
        participant.itemName = null;
      }
    }

    await DataStore.saveParticipants(State.participants);

    toggleSectionsByAttendance(attending);
    renderItemsGrid();

    statusEl.textContent = isNew ? "Presença confirmada com sucesso!" : "Sua confirmação foi atualizada.";
    showToast(isNew ? "Presença confirmada!" : "Registro atualizado!");
  }

  function initParticipantForm() {
    const form = document.getElementById("participantForm");
    form.addEventListener("submit", handleParticipantFormSubmit);

    const current = getCurrentParticipant();
    if (current) {
      fillFormFromParticipant(current);
      toggleSectionsByAttendance(current.attending);
    }
  }

  /* =======================================================================
     7. PAINEL ADMINISTRATIVO
     ======================================================================= */
  const AdminState = { authenticated: false, editingItemId: null };

  /* ---- 7.1 Autenticação ---- */
  function initAdminAuth() {
    const openBtn = document.getElementById("adminOpenBtn");
    const loginOverlay = document.getElementById("adminLoginOverlay");
    const loginForm = document.getElementById("adminLoginForm");
    const cancelBtn = document.getElementById("adminLoginCancel");
    const passwordInput = document.getElementById("adminPasswordInput");
    const errorEl = document.getElementById("adminLoginError");

    openBtn.addEventListener("click", () => {
      errorEl.hidden = true;
      passwordInput.value = "";
      loginOverlay.hidden = false;
      setTimeout(() => passwordInput.focus(), 50);
    });

    cancelBtn.addEventListener("click", () => {
      loginOverlay.hidden = true;
    });

    loginOverlay.addEventListener("click", (e) => {
      if (e.target === loginOverlay) loginOverlay.hidden = true;
    });

    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const inputHash = await sha256Hex(passwordInput.value);
      const storedHash = await DataStore.getAdminHash();
      if (inputHash === storedHash) {
        AdminState.authenticated = true;
        loginOverlay.hidden = true;
        openAdminPanel();
      } else {
        errorEl.hidden = false;
      }
    });
  }

  function openAdminPanel() {
    document.getElementById("adminPanelOverlay").hidden = false;
    switchAdminTab("dashboard");
  }

  function initAdminPanelShell() {
    document.getElementById("adminCloseBtn").addEventListener("click", () => {
      document.getElementById("adminPanelOverlay").hidden = true;
    });
    document.getElementById("adminPanelOverlay").addEventListener("click", (e) => {
      if (e.target === document.getElementById("adminPanelOverlay")) {
        document.getElementById("adminPanelOverlay").hidden = true;
      }
    });

    document.getElementById("adminTabs").addEventListener("click", (e) => {
      const btn = e.target.closest(".tab-btn");
      if (!btn) return;
      switchAdminTab(btn.dataset.tab);
    });
  }

  function switchAdminTab(tabName) {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabName);
    });
    document.querySelectorAll(".admin-tab-content").forEach((panel) => {
      panel.hidden = panel.dataset.tabPanel !== tabName;
    });

    if (tabName === "dashboard") renderDashboard();
    if (tabName === "items") renderAdminItems();
    if (tabName === "participants") renderAdminParticipants();
  }

  /* ---- 7.2 Itens (admin) ---- */
  function initAdminItemForm() {
    const form = document.getElementById("adminItemForm");
    const cancelEditBtn = document.getElementById("adminItemCancelEdit");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nameInput = document.getElementById("adminItemName");
      const neededInput = document.getElementById("adminItemNeeded");
      const editIdInput = document.getElementById("adminItemEditId");

      const name = nameInput.value.trim();
      const needed = parseInt(neededInput.value, 10);
      if (!name || !needed || needed < 1) {
        showToast("Preencha nome e quantidade válidos.", "error");
        return;
      }

      if (editIdInput.value) {
        const item = State.items.find((i) => i.id === editIdInput.value);
        if (item) {
          item.name = name;
          item.needed = needed;
        }
        showToast("Item atualizado.");
      } else {
        State.items.push({ id: slugify(name) + "-" + generateId().slice(0, 4), name, needed });
        showToast("Item adicionado.");
      }

      await DataStore.saveItems(State.items);
      resetAdminItemForm();
      renderAdminItems();
      renderItemsGrid();
    });

    cancelEditBtn.addEventListener("click", resetAdminItemForm);
  }

  function resetAdminItemForm() {
    document.getElementById("adminItemForm").reset();
    document.getElementById("adminItemEditId").value = "";
    document.getElementById("adminItemNeeded").value = 1;
    document.getElementById("adminItemCancelEdit").hidden = true;
    document.getElementById("adminItemSubmitBtn").textContent = "Adicionar item";
  }

  function editAdminItem(itemId) {
    const item = State.items.find((i) => i.id === itemId);
    if (!item) return;
    document.getElementById("adminItemEditId").value = item.id;
    document.getElementById("adminItemName").value = item.name;
    document.getElementById("adminItemNeeded").value = item.needed;
    document.getElementById("adminItemCancelEdit").hidden = false;
    document.getElementById("adminItemSubmitBtn").textContent = "Salvar alterações";
    document.getElementById("adminItemName").focus();
  }

  async function deleteAdminItem(itemId) {
    const item = State.items.find((i) => i.id === itemId);
    if (!item) return;
    const confirmed = window.confirm(`Excluir o item "${item.name}"? Participantes que o escolheram ficarão sem item.`);
    if (!confirmed) return;

    State.items = State.items.filter((i) => i.id !== itemId);
    State.participants.forEach((p) => {
      if (p.itemId === itemId) {
        p.itemId = null;
        p.itemName = null;
      }
    });

    await DataStore.saveItems(State.items);
    await DataStore.saveParticipants(State.participants);
    renderAdminItems();
    renderItemsGrid();
    showToast("Item excluído.");
  }

  function renderAdminItems() {
    const list = document.getElementById("adminItemsList");
    list.innerHTML = "";

    State.items.forEach((item) => {
      const stats = computeItemStats(item);
      const row = document.createElement("div");
      row.className = "admin-list-row";
      row.innerHTML = `
        <div class="item-info">
          <strong>${escapeHtml(item.name)}</strong>
          <span>Necessário: ${item.needed} · Escolhido: ${stats.chosen} · Restante: ${stats.remaining}</span>
        </div>
        <div class="item-actions">
          <button type="button" data-action="edit" data-id="${item.id}">Editar</button>
          <button type="button" class="danger" data-action="delete" data-id="${item.id}">Excluir</button>
        </div>
      `;
      list.appendChild(row);
    });

    list.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener("click", () => editAdminItem(btn.dataset.id));
    });
    list.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener("click", () => deleteAdminItem(btn.dataset.id));
    });
  }

  /* ---- 7.3 Participantes (admin) ---- */
  function renderAdminParticipants(filterText) {
    const tbody = document.getElementById("adminParticipantsBody");
    const emptyState = document.getElementById("adminParticipantsEmpty");
    const term = (filterText || "").trim().toLowerCase();

    const filtered = State.participants.filter((p) => {
      if (!term) return true;
      return p.name.toLowerCase().includes(term) || p.phone.toLowerCase().includes(term);
    });

    tbody.innerHTML = "";
    emptyState.hidden = filtered.length > 0;

    filtered.forEach((p) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(p.name)}</td>
        <td>${escapeHtml(p.phone)}</td>
        <td>${p.attending === "sim" ? "Sim" : "Não"}</td>
        <td>${p.companions ?? 0}</td>
        <td>${escapeHtml(p.itemName || "-")}</td>
        <td>${escapeHtml(p.note || "-")}</td>
        <td class="col-actions">
          <button type="button" class="row-btn" data-action="edit" data-id="${p.id}">Editar</button>
          <button type="button" class="row-btn danger" data-action="delete" data-id="${p.id}">Excluir</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener("click", () => openEditParticipant(btn.dataset.id));
    });
    tbody.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener("click", () => deleteParticipant(btn.dataset.id));
    });
  }

  async function deleteParticipant(participantId) {
    const participant = State.participants.find((p) => p.id === participantId);
    if (!participant) return;
    const confirmed = window.confirm(`Excluir o participante "${participant.name}"?`);
    if (!confirmed) return;

    State.participants = State.participants.filter((p) => p.id !== participantId);
    await DataStore.saveParticipants(State.participants);

    if (State.currentParticipantId === participantId) {
      State.currentParticipantId = null;
      await DataStore.setCurrentParticipantId(null);
    }

    renderAdminParticipants(document.getElementById("adminParticipantSearch").value);
    renderItemsGrid();
    showToast("Participante excluído.");
  }

  function populateEditItemSelect(selectedItemId) {
    const select = document.getElementById("editParticipantItem");
    select.innerHTML = '<option value="">Nenhum</option>';
    State.items.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.name;
      if (item.id === selectedItemId) option.selected = true;
      select.appendChild(option);
    });
  }

  function openEditParticipant(participantId) {
    const participant = State.participants.find((p) => p.id === participantId);
    if (!participant) return;

    document.getElementById("editParticipantId").value = participant.id;
    document.getElementById("editParticipantName").value = participant.name;
    document.getElementById("editParticipantPhone").value = participant.phone;
    document.getElementById("editParticipantAttending").value = participant.attending;
    document.getElementById("editParticipantCompanions").value = participant.companions ?? 0;
    document.getElementById("editParticipantNote").value = participant.note || "";
    populateEditItemSelect(participant.itemId);

    document.getElementById("editParticipantOverlay").hidden = false;
  }

  function initEditParticipantModal() {
    const overlay = document.getElementById("editParticipantOverlay");
    const form = document.getElementById("editParticipantForm");
    const closeBtn = document.getElementById("editParticipantCloseBtn");
    const cancelBtn = document.getElementById("editParticipantCancel");

    function close() {
      overlay.hidden = true;
    }

    closeBtn.addEventListener("click", close);
    cancelBtn.addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("editParticipantId").value;
      const participant = State.participants.find((p) => p.id === id);
      if (!participant) return;

      participant.name = document.getElementById("editParticipantName").value.trim();
      participant.phone = document.getElementById("editParticipantPhone").value.trim();
      participant.attending = document.getElementById("editParticipantAttending").value;
      participant.companions = parseInt(document.getElementById("editParticipantCompanions").value, 10) || 0;
      participant.note = document.getElementById("editParticipantNote").value.trim();

      const chosenItemId = document.getElementById("editParticipantItem").value;
      if (participant.attending === "nao" || !chosenItemId) {
        participant.itemId = null;
        participant.itemName = null;
      } else {
        const item = State.items.find((i) => i.id === chosenItemId);
        participant.itemId = item ? item.id : null;
        participant.itemName = item ? item.name : null;
      }
      participant.updatedAt = nowISO();

      await DataStore.saveParticipants(State.participants);
      close();
      renderAdminParticipants(document.getElementById("adminParticipantSearch").value);
      renderDashboard();
      renderItemsGrid();

      if (participant.id === State.currentParticipantId) {
        fillFormFromParticipant(participant);
        toggleSectionsByAttendance(participant.attending);
      }
      showToast("Participante atualizado.");
    });
  }

  function initAdminParticipantSearch() {
    const searchInput = document.getElementById("adminParticipantSearch");
    searchInput.addEventListener(
      "input",
      debounce(() => renderAdminParticipants(searchInput.value), 200)
    );
  }

  /* ---- 7.4 Exportar CSV / Imprimir ---- */
  function buildParticipantsCsv(list) {
    const headers = ["Nome", "Telefone", "Presenca", "Acompanhantes", "Item", "Observacao", "Atualizado em"];
    const rows = list.map((p) => [
      p.name,
      p.phone,
      p.attending === "sim" ? "Sim" : "Nao",
      p.companions ?? 0,
      p.itemName || "-",
      p.note || "-",
      formatDateTime(p.updatedAt)
    ]);
    const escapeCsv = (value) => `"${String(value).replace(/"/g, '""')}"`;
    const lines = [headers, ...rows].map((row) => row.map(escapeCsv).join(";"));
    return lines.join("\r\n");
  }

  function initExportCsv() {
    document.getElementById("exportCsvBtn").addEventListener("click", () => {
      const csv = buildParticipantsCsv(State.participants);
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const dateSlug = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `participantes-arraia-evolution-${dateSlug}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast("CSV exportado.");
    });
  }

  function initPrintList() {
    document.getElementById("printListBtn").addEventListener("click", () => {
      const printArea = document.getElementById("printArea");
      const rows = State.participants
        .map(
          (p) => `
        <tr>
          <td>${escapeHtml(p.name)}</td>
          <td>${escapeHtml(p.phone)}</td>
          <td>${p.attending === "sim" ? "Sim" : "Não"}</td>
          <td>${p.companions ?? 0}</td>
          <td>${escapeHtml(p.itemName || "-")}</td>
          <td>${escapeHtml(p.note || "-")}</td>
        </tr>`
        )
        .join("");

      printArea.innerHTML = `
        <h1>Arraiá da Evolution Fitness Studio — Lista de Participantes</h1>
        <table>
          <thead>
            <tr>
              <th>Nome</th><th>Telefone</th><th>Presença</th><th>Acomp.</th><th>Item</th><th>Observação</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
      window.print();
    });
  }

  /* ---- 7.5 Dashboard ---- */
  function renderDashboard() {
    const total = State.participants.length;
    const confirmed = State.participants.filter((p) => p.attending === "sim").length;
    const notAttending = State.participants.filter((p) => p.attending === "nao").length;
    const totalCompanions = State.participants
      .filter((p) => p.attending === "sim")
      .reduce((sum, p) => sum + (p.companions || 0), 0);

    const itemStatsList = State.items.map((item) => ({ item, stats: computeItemStats(item) }));
    const itemsComplete = itemStatsList.filter((entry) => entry.stats.isFull).length;
    const itemsMissing = State.items.length - itemsComplete;

    const dashboard = document.getElementById("tabDashboard");
    dashboard.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">Total de participantes</div></div>
        <div class="stat-card"><div class="stat-value">${confirmed}</div><div class="stat-label">Confirmados</div></div>
        <div class="stat-card"><div class="stat-value">${notAttending}</div><div class="stat-label">Não irão</div></div>
        <div class="stat-card"><div class="stat-value">${totalCompanions}</div><div class="stat-label">Acompanhantes</div></div>
        <div class="stat-card"><div class="stat-value">${itemsComplete}</div><div class="stat-label">Itens completos</div></div>
        <div class="stat-card"><div class="stat-value">${itemsMissing}</div><div class="stat-label">Itens faltando</div></div>
      </div>
      <div class="stats-subsection">
        <h3>Restante por item</h3>
        ${itemStatsList
          .map(
            (entry) => `
          <div class="stats-item-row">
            <span>${escapeHtml(entry.item.name)}</span>
            <span>
              ${entry.stats.chosen}/${entry.item.needed}
              ${entry.stats.isFull ? '<span class="tag-complete">COMPLETO</span>' : `<span class="tag-missing">faltam ${entry.stats.remaining}</span>`}
            </span>
          </div>`
          )
          .join("")}
      </div>
    `;
  }

  /* =======================================================================
     8. INICIALIZAÇÃO
     ======================================================================= */
  async function loadState() {
    State.items = await DataStore.getItems();
    State.participants = await DataStore.getParticipants();
    State.currentParticipantId = await DataStore.getCurrentParticipantId();
  }

  function initHeroParallax() {
    const heroVisual = document.getElementById("heroVisual");
    if (!heroVisual) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    let ticking = false;
    window.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          const offset = Math.min(window.scrollY * 0.08, 24);
          heroVisual.style.transform = `translateY(${offset}px)`;
          ticking = false;
        });
      },
      { passive: true }
    );
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./service-worker.js").catch(() => {
          /* Falha silenciosa: app continua funcional sem PWA offline */
        });
      });
    }
  }

  async function init() {
    await DataStore.init();
    await loadState();

    initParticipantForm();
    renderItemsGrid();

    initAdminAuth();
    initAdminPanelShell();
    initAdminItemForm();
    initEditParticipantModal();
    initAdminParticipantSearch();
    initExportCsv();
    initPrintList();
    initHeroParallax();

    registerServiceWorker();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
