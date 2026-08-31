(function () {
  "use strict";

  var ENVELOPES_BASE = [
    { id: "urgente", label: "Urgência", icon: "ti-alert-circle", bgIcon: "#3D2A1A", colorLight: "#F0A868", colorStrong: "#E8483C" },
    { id: "necessidade", label: "Necessidade", icon: "ti-package", bgIcon: "#3A3316", colorLight: "#E0C260", colorStrong: "#C99A2E" },
    { id: "futuro", label: "Futuro", icon: "ti-hourglass", bgIcon: "#1C2E42", colorLight: "#6FA8E0", colorStrong: "#2F6FB8" },
    { id: "voce", label: "Você", icon: "ti-heart", bgIcon: "#1E3320", colorLight: "#7AC98A", colorStrong: "#3F9354" },
    { id: "reserva", label: "Reserva", icon: "ti-pig-money", bgIcon: "#2E2149", colorLight: "#B48CE0", colorStrong: "#8A5FC4", acumula: true }
  ];

  var DEFAULT_PCTS = { urgente: 32, necessidade: 23, futuro: 18, voce: 17, reserva: 10 };

  var LS_ITEMS = "envelopes_items";
  var LS_HISTORY = "envelopes_history";
  var LS_PCTS = "envelopes_pcts";
  var LS_RESERVA = "envelopes_reserva_total";

  var state = {
    items: [],
    history: [],
    pcts: Object.assign({}, DEFAULT_PCTS),
    reservaTotal: 0,
    preview: null
  };

  function hexToRgb(hex) {
    var v = parseInt(hex.slice(1), 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  }

  function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map(function (c) {
      return Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0");
    }).join("");
  }

  function urgencyColor(env, createdAt) {
    var diasEsperando = (Date.now() - createdAt) / 86400000;
    var t = Math.max(0, Math.min(1, diasEsperando / 14));
    var a = hexToRgb(env.colorLight);
    var b = hexToRgb(env.colorStrong);
    return rgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
  }


  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  function formatBRL(n) {
    return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function safeParse(raw, fallback) {
    try {
      var v = JSON.parse(raw);
      return v === null || v === undefined ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function loadState() {
    state.items = safeParse(localStorage.getItem(LS_ITEMS), []);
    state.history = safeParse(localStorage.getItem(LS_HISTORY), []);
    state.pcts = safeParse(localStorage.getItem(LS_PCTS), Object.assign({}, DEFAULT_PCTS));
    state.reservaTotal = parseFloat(localStorage.getItem(LS_RESERVA)) || 0;
  }

  function saveItems() {
    try {
      localStorage.setItem(LS_ITEMS, JSON.stringify(state.items));
      return true;
    } catch (e) {
      return false;
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(LS_HISTORY, JSON.stringify(state.history));
      return true;
    } catch (e) {
      return false;
    }
  }

  function savePcts() {
    try {
      localStorage.setItem(LS_PCTS, JSON.stringify(state.pcts));
      return true;
    } catch (e) {
      return false;
    }
  }

  function saveReserva() {
    try {
      localStorage.setItem(LS_RESERVA, String(state.reservaTotal));
      return true;
    } catch (e) {
      return false;
    }
  }

  function showToast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(function () {
      t.classList.remove("show");
    }, 2200);
  }

  function showSaveError(msg) {
    var el = document.getElementById("save-error");
    if (msg) {
      el.textContent = msg;
      el.style.display = "block";
    } else {
      el.style.display = "none";
    }
  }

  // ---------- Render: fila atual ----------
  function renderQueue() {
    var container = document.getElementById("queue-list");
    container.innerHTML = "";

    var allItems = state.items
      .filter(function (i) {
        var env = ENVELOPES_BASE.find(function (e) { return e.id === i.envelope; });
        return env && !env.acumula;
      })
      .sort(function (a, b) { return a.criado - b.criado; });

    if (allItems.length === 0) {
      var p = document.createElement("p");
      p.className = "empty-note";
      p.textContent = "Nada na fila ainda. Adiciona o que vier na cabeça — remédio, roupa, o que for.";
      container.appendChild(p);
      return;
    }

    allItems.forEach(function (item) {
      var env = ENVELOPES_BASE.find(function (e) { return e.id === item.envelope; });
      var stripColor = urgencyColor(env, item.criado);

      var row = document.createElement("div");
      row.className = "queue-item";
      row.style.borderLeft = "4px solid " + stripColor;

      var left = document.createElement("div");
      left.style.display = "flex";
      left.style.alignItems = "center";
      left.style.gap = "10px";

      var iconWrap = document.createElement("span");
      iconWrap.className = "queue-icon";
      iconWrap.style.background = env.bgIcon;
      var icon = document.createElement("i");
      icon.className = "ti " + env.icon;
      icon.style.color = stripColor;
      icon.setAttribute("aria-hidden", "true");
      iconWrap.appendChild(icon);

      var info = document.createElement("div");
      var nome = document.createElement("p");
      nome.textContent = item.nome;
      var sub = document.createElement("p");
      var dias = Math.floor((Date.now() - item.criado) / 86400000);
      sub.textContent = dias <= 0 ? env.label + " · hoje" : env.label + " · há " + dias + (dias === 1 ? " dia" : " dias");
      info.appendChild(nome);
      info.appendChild(sub);

      left.appendChild(iconWrap);
      left.appendChild(info);

      var right = document.createElement("div");
      right.style.display = "flex";
      right.style.alignItems = "center";
      right.style.gap = "8px";

      var valor = document.createElement("span");
      valor.className = "queue-valor";
      valor.textContent = formatBRL(item.valor);

      var btn = document.createElement("button");
      btn.setAttribute("aria-label", "Remover " + item.nome);
      btn.className = "queue-remove";
      btn.innerHTML = '<i class="ti ti-x" aria-hidden="true"></i>';
      btn.addEventListener("click", function () {
        state.items = state.items.filter(function (i) { return i.id !== item.id; });
        if (!saveItems()) {
          showSaveError("Não salvou a remoção. Tenta de novo.");
          return;
        }
        showSaveError("");
        renderQueue();
        renderHome();
      });

      right.appendChild(valor);
      right.appendChild(btn);

      row.appendChild(left);
      row.appendChild(right);
      container.appendChild(row);
    });
  }

  // ---------- Render: reserva ----------
  function renderReserva() {
    var pill = document.getElementById("reserva-pill");
    if (!pill) return;
    pill.style.display = state.reservaTotal > 0 ? "flex" : "none";
    pill.setAttribute("aria-label", "Reserva acumulada: " + formatBRL(state.reservaTotal));
  }

  // ---------- Formulário de novo item ----------
  var selectedEnvelope = "urgente";

  function renderEnvelopeChips() {
    var container = document.getElementById("form-envelope-chips");
    container.innerHTML = "";
    ENVELOPES_BASE.filter(function (e) { return !e.acumula; }).forEach(function (env) {
      var chip = document.createElement("div");
      chip.className = "chip-option" + (env.id === selectedEnvelope ? " selected" : "");
      chip.style.setProperty("--chip-color", env.colorStrong);
      chip.dataset.envId = env.id;

      var icon = document.createElement("i");
      icon.className = "ti " + env.icon;
      icon.setAttribute("aria-hidden", "true");

      var label = document.createElement("p");
      label.textContent = env.label;

      chip.appendChild(icon);
      chip.appendChild(label);
      chip.addEventListener("click", function () {
        selectedEnvelope = env.id;
        renderEnvelopeChips();
      });
      container.appendChild(chip);
    });
  }

  function setupFormHandlers() {
    var overlay = document.getElementById("form-overlay");
    var btnShow = document.getElementById("btn-show-form");
    var btnAdd = document.getElementById("btn-add-item");
    var btnCancel = document.getElementById("btn-cancel-form");
    var errEl = document.getElementById("form-error");
    var parcelarToggle = document.getElementById("form-parcelar-toggle");
    var parcelasWrap = document.getElementById("form-parcelas-wrap");
    var parcelasInput = document.getElementById("form-parcelas-max");
    var valorInput = document.getElementById("form-valor");
    var parcelaPreview = document.getElementById("form-parcela-preview");

    function updateParcelaPreview() {
      var valor = parseFloat(valorInput.value.replace(",", "."));
      var parcelas = parseInt(parcelasInput.value, 10);
      if (!isNaN(valor) && valor > 0 && !isNaN(parcelas) && parcelas > 1) {
        parcelaPreview.textContent = "Fica em " + formatBRL(valor / parcelas) + " por mês";
      } else {
        parcelaPreview.textContent = "";
      }
    }

    parcelarToggle.addEventListener("click", function () {
      var ativo = parcelarToggle.getAttribute("aria-pressed") === "true";
      parcelarToggle.setAttribute("aria-pressed", String(!ativo));
      parcelasWrap.style.display = ativo ? "none" : "block";
      if (ativo) parcelasInput.value = "";
      updateParcelaPreview();
    });

    valorInput.addEventListener("input", updateParcelaPreview);
    parcelasInput.addEventListener("input", updateParcelaPreview);

    btnShow.addEventListener("click", function () {
      selectedEnvelope = "urgente";
      renderEnvelopeChips();
      overlay.classList.add("active");
    });

    function closeForm() {
      overlay.classList.remove("active");
      errEl.style.display = "none";
      document.getElementById("form-nome").value = "";
      valorInput.value = "";
      parcelasInput.value = "";
      parcelaPreview.textContent = "";
      parcelarToggle.setAttribute("aria-pressed", "false");
      parcelasWrap.style.display = "none";
    }

    btnCancel.addEventListener("click", closeForm);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeForm();
    });

    btnAdd.addEventListener("click", function () {
      var nome = document.getElementById("form-nome").value.trim();
      var valorRaw = valorInput.value;
      var valor = parseFloat(valorRaw.replace(",", "."));
      var parcelarAtivo = parcelarToggle.getAttribute("aria-pressed") === "true";
      var parcelasMaxRaw = parcelarAtivo ? parcelasInput.value : "";
      var parcelasMax = parcelasMaxRaw ? parseInt(parcelasMaxRaw, 10) : null;

      if (!nome) {
        errEl.textContent = "Dá um nome pro item.";
        errEl.style.display = "block";
        return;
      }
      if (!valorRaw || isNaN(valor) || valor <= 0) {
        errEl.textContent = "Valor precisa ser um número maior que zero.";
        errEl.style.display = "block";
        return;
      }
      if (parcelarAtivo && (!parcelasMaxRaw || isNaN(parcelasMax) || parcelasMax <= 1)) {
        errEl.textContent = "Informa em quantas parcelas, maior que 1.";
        errEl.style.display = "block";
        return;
      }

      state.items.push({
        id: uid(),
        nome: nome,
        envelope: selectedEnvelope,
        valor: valor,
        criado: Date.now(),
        parcelasMax: parcelasMax
      });
      if (!saveItems()) {
        errEl.textContent = "Não salvou. Tenta de novo.";
        errEl.style.display = "block";
        state.items.pop();
        return;
      }

      renderQueue();
      renderHome();
      closeForm();
    });
  }

  // ---------- Cálculo e confirmação de alocação ----------
  function calcularAlocacao() {
    var raw = document.getElementById("dinheiro-livre").value;
    var total = parseFloat(raw.replace(",", "."));
    if (!raw || isNaN(total) || total <= 0) {
      showToast("Digita um valor válido primeiro.");
      return;
    }

    var alocacao = ENVELOPES_BASE.map(function (env) {
      var pct = state.pcts[env.id] || 0;
      var valorEnvelope = (total * pct) / 100;

      if (env.acumula) {
        return Object.assign({}, env, { pct: pct, valorEnvelope: valorEnvelope, cabe: [], naoCabe: [], sobra: 0 });
      }

      var fila = state.items
        .filter(function (i) { return i.envelope === env.id; })
        .sort(function (a, b) { return a.criado - b.criado; });

      var restante = valorEnvelope;
      var cabe = [];
      var naoCabe = [];
      fila.forEach(function (item) {
        if (item.valor <= restante) {
          cabe.push(Object.assign({}, item, { modo: "avista" }));
          restante -= item.valor;
          return;
        }
        if (item.parcelasMax) {
          var valorParcela = item.valor / item.parcelasMax;
          if (valorParcela <= restante) {
            cabe.push(Object.assign({}, item, { modo: "parcelado", valorParcela: valorParcela }));
            restante -= valorParcela;
            return;
          }
        }
        naoCabe.push(item);
      });

      return Object.assign({}, env, { pct: pct, valorEnvelope: valorEnvelope, cabe: cabe, naoCabe: naoCabe, sobra: restante });
    });

    state.preview = { total: total, alocacao: alocacao };
    renderPreview();
  }

  function renderPreview() {
    var section = document.getElementById("preview-section");
    var container = document.getElementById("preview-envelopes");
    container.innerHTML = "";

    if (!state.preview) {
      section.style.display = "none";
      return;
    }
    section.style.display = "block";

    state.preview.alocacao.forEach(function (env) {
      var usado = env.valorEnvelope - (env.acumula ? 0 : env.sobra);
      var pctUsado = env.valorEnvelope > 0 ? Math.min(100, (usado / env.valorEnvelope) * 100) : 0;

      var card = document.createElement("div");
      card.className = "preview-env-card";
      card.style.background = env.bgIcon;

      var head = document.createElement("div");
      head.className = "preview-env-head";
      var labelWrap = document.createElement("div");
      labelWrap.className = "preview-env-label";
      var icon = document.createElement("i");
      icon.className = "ti " + env.icon;
      icon.style.color = env.colorLight;
      icon.setAttribute("aria-hidden", "true");
      var l = document.createElement("span");
      l.textContent = env.label;
      l.style.color = env.colorLight;
      labelWrap.appendChild(icon);
      labelWrap.appendChild(l);
      var v = document.createElement("span");
      v.className = "preview-env-value";
      v.textContent = formatBRL(env.valorEnvelope);
      v.style.color = env.colorLight;
      head.appendChild(labelWrap);
      head.appendChild(v);
      card.appendChild(head);

      if (!env.acumula) {
        var track = document.createElement("div");
        track.className = "preview-bar-track";
        var fill = document.createElement("div");
        fill.className = "preview-bar-fill";
        fill.style.width = pctUsado + "%";
        fill.style.background = env.colorLight;
        track.appendChild(fill);
        card.appendChild(track);
      }

      if (env.acumula) {
        var pr = document.createElement("p");
        pr.className = "preview-item";
        pr.style.color = env.colorLight;
        pr.style.opacity = "0.8";
        pr.textContent = "Guardado direto, sem gastar";
        card.appendChild(pr);
      } else {
        env.cabe.forEach(function (i) {
          var p = document.createElement("p");
          p.className = "preview-item";
          p.style.color = env.colorLight;
          if (i.modo === "parcelado") {
            p.textContent = "✓ " + i.nome + " — parcelado em " + i.parcelasMax + "x de " + formatBRL(i.valorParcela);
          } else {
            p.textContent = "✓ " + i.nome + " — " + formatBRL(i.valor);
          }
          card.appendChild(p);
        });
        env.naoCabe.forEach(function (i) {
          var p = document.createElement("p");
          p.className = "preview-item";
          p.style.color = env.colorLight;
          p.style.opacity = "0.55";
          p.textContent = "· " + i.nome + " fica na fila";
          card.appendChild(p);
        });
        if (env.cabe.length === 0 && env.naoCabe.length === 0) {
          var pe = document.createElement("p");
          pe.className = "preview-item";
          pe.style.color = env.colorLight;
          pe.style.opacity = "0.55";
          pe.textContent = "Sem itens na fila";
          card.appendChild(pe);
        }
      }

      container.appendChild(card);
    });
  }

  function cancelarPreview() {
    state.preview = null;
    renderPreview();
  }

  function confirmarAlocacao() {
    if (!state.preview) return;

    var total = state.preview.total;
    var alocacao = state.preview.alocacao;

    var idsComprados = [];
    var novaReserva = state.reservaTotal;
    alocacao.forEach(function (env) {
      if (env.acumula) {
        novaReserva += env.valorEnvelope;
      } else {
        env.cabe.forEach(function (i) { idsComprados.push(i.id); });
      }
    });

    var nextItems = state.items.filter(function (i) { return idsComprados.indexOf(i.id) === -1; });
    var record = { data: Date.now(), total: total, alocacao: alocacao };
    var nextHistory = state.history.concat([record]);

    // Aplica e persiste tudo; se qualquer save falhar, reverte e avisa (nunca some sem confirmar).
    var prevItems = state.items;
    var prevHistory = state.history;
    var prevReserva = state.reservaTotal;

    state.items = nextItems;
    state.history = nextHistory;
    state.reservaTotal = novaReserva;

    var ok = saveItems() && saveHistory() && saveReserva();

    if (!ok) {
      state.items = prevItems;
      state.history = prevHistory;
      state.reservaTotal = prevReserva;
      showSaveError("Não salvou tudo direito. Os itens continuam na fila, tenta confirmar de novo.");
      return;
    }

    showSaveError("");
    state.preview = null;
    document.getElementById("dinheiro-livre").value = "";

    renderQueue();
    renderPreview();
    renderReserva();
    renderLastClose(record);
    renderHistoryList();
    renderHome();
    showToast("Alocação confirmada.");
  }

  // ---------- Último fechamento (barra de progresso) ----------
  function renderLastClose(record) {
    var section = document.getElementById("last-close-section");
    var label = document.getElementById("last-close-label");
    var container = document.getElementById("last-close-envelopes");
    container.innerHTML = "";

    if (!record) {
      section.style.display = "none";
      return;
    }
    section.style.display = "block";
    label.textContent = "Última alocação · " + formatBRL(record.total);

    record.alocacao.forEach(function (env) {
      var usado = env.acumula ? env.valorEnvelope : env.valorEnvelope - env.sobra;
      var pctUsado = env.valorEnvelope > 0 ? Math.min(100, (usado / env.valorEnvelope) * 100) : 0;

      var card = document.createElement("div");
      card.style.background = "var(--input-bg)";
      card.style.borderRadius = "16px";
      card.style.padding = "14px 16px";
      card.style.marginBottom = "10px";

      var head = document.createElement("div");
      head.className = "alloc-head";
      var l = document.createElement("span");
      l.textContent = env.label;
      var v = document.createElement("span");
      v.textContent = formatBRL(env.valorEnvelope);
      head.appendChild(l);
      head.appendChild(v);
      card.appendChild(head);

      var track = document.createElement("div");
      track.className = "alloc-bar-track";
      var fill = document.createElement("div");
      fill.className = "alloc-bar-fill";
      fill.style.width = pctUsado + "%";
      fill.style.background = env.colorStrong;
      track.appendChild(fill);
      card.appendChild(track);

      if (env.acumula) {
        var pr = document.createElement("p");
        pr.className = "alloc-empty";
        pr.textContent = "Guardado direto na reserva, sem gastar";
        card.appendChild(pr);
      } else if (env.cabe.length === 0 && env.naoCabe.length === 0) {
        var pe = document.createElement("p");
        pe.className = "alloc-empty";
        pe.textContent = "Nenhum item na fila";
        card.appendChild(pe);
      } else {
        env.cabe.forEach(function (i) {
          var p = document.createElement("p");
          p.className = "alloc-line";
          p.innerHTML = '<span style="color:' + env.colorStrong + '">✓</span> ' + i.nome + " — " + formatBRL(i.valor);
          card.appendChild(p);
        });
        env.naoCabe.forEach(function (i) {
          var p = document.createElement("p");
          p.className = "alloc-line faded";
          p.textContent = "· " + i.nome + " — " + formatBRL(i.valor) + " (fica pro próximo mês)";
          card.appendChild(p);
        });
      }

      container.appendChild(card);
    });
  }

  // ---------- Histórico ----------
  function renderHistoryList() {
    var container = document.getElementById("history-list");
    container.innerHTML = "";

    if (state.history.length === 0) {
      var p = document.createElement("p");
      p.className = "empty-note";
      p.textContent = "Nenhuma alocação feita ainda.";
      container.appendChild(p);
      return;
    }

    state.history.slice().reverse().forEach(function (rec, idx) {
      var entry = document.createElement("div");
      entry.className = "hist-entry";

      var head = document.createElement("div");
      head.className = "hist-head";
      var dateSpan = document.createElement("span");
      dateSpan.textContent = new Date(rec.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
      var totalSpan = document.createElement("span");
      totalSpan.textContent = formatBRL(rec.total);
      head.appendChild(dateSpan);
      head.appendChild(totalSpan);
      entry.appendChild(head);

      rec.alocacao.forEach(function (env) {
        if (env.acumula) return;
        var resolvidos = env.cabe || [];
        resolvidos.forEach(function (i) {
          var p = document.createElement("p");
          p.className = "alloc-line";
          p.innerHTML = '<span style="color:' + env.colorStrong + '">✓</span> ' + i.nome + " — " + formatBRL(i.valor) +
            ' <span style="color:var(--text-muted)">(' + env.label + ")</span>";
          entry.appendChild(p);
        });
      });

      container.appendChild(entry);
    });
  }

  // ---------- Configurações (percentuais) ----------
  function renderPctRows(draft) {
    var container = document.getElementById("pct-rows");
    container.innerHTML = "";
    ENVELOPES_BASE.forEach(function (env) {
      var row = document.createElement("div");
      row.className = "pct-row";

      var label = document.createElement("span");
      label.textContent = env.label;

      var input = document.createElement("input");
      input.type = "number";
      input.inputMode = "numeric";
      input.min = "0";
      input.max = "100";
      input.className = "pct-input";
      input.value = draft[env.id];
      input.dataset.envId = env.id;

      var pct = document.createElement("span");
      pct.textContent = "%";

      row.appendChild(label);
      row.appendChild(input);
      row.appendChild(pct);
      container.appendChild(row);
    });
  }

  // ---------- Backup: export / import ----------
  function exportBackup() {
    var payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      items: state.items,
      history: state.history,
      pcts: state.pcts,
      reservaTotal: state.reservaTotal
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = "backup-envelopes-" + dateStr + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Backup exportado.");
  }

  function importBackup(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var data = safeParse(reader.result, null);
      if (!data || !Array.isArray(data.items) || !Array.isArray(data.history)) {
        showToast("Arquivo inválido. Não importei nada.");
        return;
      }

      state.items = data.items;
      state.history = data.history;
      state.pcts = data.pcts && typeof data.pcts === "object" ? data.pcts : Object.assign({}, DEFAULT_PCTS);
      state.reservaTotal = parseFloat(data.reservaTotal) || 0;

      var ok = saveItems() && saveHistory() && savePcts() && saveReserva();
      if (!ok) {
        showToast("Não consegui salvar o backup importado.");
        return;
      }

      renderQueue();
      renderReserva();
      renderLastClose(state.history[state.history.length - 1] || null);
      renderHistoryList();
      renderHome();
      showToast("Backup importado com sucesso.");
    };
    reader.readAsText(file);
  }

  // ---------- Navegação entre Fila e Ajustes ----------
  function goToScreen(name) {
    document.querySelectorAll(".screen").forEach(function (el) {
      el.classList.toggle("active", el.id === "screen-" + name);
    });
    if (name === "ajustes") {
      renderHistoryList();
      renderPctRows(state.pcts);
      renderLastClose(state.history[state.history.length - 1] || null);
    }
  }

  // ---------- Render: carrossel de envelopes ----------
  function renderEnvelopeScroll() {
    var container = document.getElementById("envelope-scroll");
    container.innerHTML = "";

    var lastRecord = state.history[state.history.length - 1];

    ENVELOPES_BASE.forEach(function (env) {
      var chip = document.createElement("div");
      chip.className = "envelope-chip";
      chip.style.background = env.bgIcon;

      var icon = document.createElement("i");
      icon.className = "ti " + env.icon;
      icon.style.color = env.colorLight;
      icon.setAttribute("aria-hidden", "true");

      var label = document.createElement("p");
      label.textContent = env.label;
      label.style.color = env.colorLight;

      var value = document.createElement("p");
      var envAlloc = lastRecord ? lastRecord.alocacao.find(function (a) { return a.id === env.id; }) : null;
      if (envAlloc) {
        value.textContent = formatBRL(envAlloc.valorEnvelope);
        value.style.color = env.colorLight;
      } else {
        value.textContent = env.id === "reserva" ? formatBRL(state.reservaTotal) : (state.pcts[env.id] || 0) + "%";
        value.style.color = env.colorLight;
        value.style.opacity = "0.7";
      }

      chip.appendChild(icon);
      chip.appendChild(label);
      chip.appendChild(value);
      container.appendChild(chip);
    });
  }

  // ---------- Render: valor livre no topo ----------
  function renderHome() {
    var lastRecord = state.history[state.history.length - 1];
    var valorEl = document.getElementById("home-livre-valor");
    valorEl.textContent = lastRecord ? formatBRL(lastRecord.total) + " alocados" : "Onde entra o dinheiro";

    var filaCount = state.items.filter(function (i) {
      var env = ENVELOPES_BASE.find(function (e) { return e.id === i.envelope; });
      return env && !env.acumula;
    }).length;
    var countEl = document.getElementById("fila-count");
    if (countEl) countEl.textContent = filaCount + (filaCount === 1 ? " item" : " itens");

    renderEnvelopeScroll();
  }

  // ---------- Bloqueio de pull-to-refresh ----------
  function disablePullToRefresh() {
    var startY = 0;

    document.addEventListener("touchstart", function (e) {
      if (e.touches.length === 1) {
        startY = e.touches[0].clientY;
      }
    }, { passive: true });

    document.addEventListener("touchmove", function (e) {
      var y = e.touches[0].clientY;
      var scrollingUp = y > startY;
      var atTop = window.scrollY === 0;
      if (scrollingUp && atTop) {
        e.preventDefault();
      }
    }, { passive: false });
  }

  // ---------- Wiring geral ----------
  function init() {
    loadState();
    setupFormHandlers();
    disablePullToRefresh();

    renderQueue();
    renderReserva();
    renderHome();
    renderLastClose(state.history[state.history.length - 1] || null);

    document.getElementById("btn-calcular").addEventListener("click", calcularAlocacao);
    document.getElementById("btn-open-menu").addEventListener("click", function () {
      var emAjustes = document.getElementById("screen-ajustes").classList.contains("active");
      goToScreen(emAjustes ? "fila" : "ajustes");
    });
    document.getElementById("btn-confirmar").addEventListener("click", confirmarAlocacao);
    document.getElementById("btn-cancelar-preview").addEventListener("click", cancelarPreview);

    document.getElementById("btn-save-pcts").addEventListener("click", function () {
      var inputs = document.querySelectorAll("#pct-rows input");
      var draft = {};
      var soma = 0;
      inputs.forEach(function (inp) {
        var v = parseInt(inp.value, 10) || 0;
        draft[inp.dataset.envId] = v;
        soma += v;
      });

      var errEl = document.getElementById("pct-error");
      if (soma !== 100) {
        errEl.textContent = "Os percentuais somam " + soma + "%. Precisa fechar em 100%.";
        errEl.style.display = "block";
        return;
      }

      state.pcts = draft;
      if (!savePcts()) {
        errEl.textContent = "Não salvou. Tenta de novo.";
        errEl.style.display = "block";
        return;
      }
      errEl.style.display = "none";
      showToast("Percentuais atualizados.");
    });

    document.getElementById("btn-export").addEventListener("click", exportBackup);
    document.getElementById("import-file").addEventListener("change", function (e) {
      var file = e.target.files[0];
      if (file) importBackup(file);
      e.target.value = "";
    });

    if ("serviceWorker" in navigator) {
      try {
        navigator.serviceWorker.register("sw.js").catch(function () {});
      } catch (e) {}
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
