(function () {
  "use strict";

  const config = window.SIGNATURE_CONFIG || {};
  const company = config.company || {};
  const state = {
    template: "",
    html: "",
    logoDataUrl: "",
    employees: [],
    selectedIndex: 0,
    badgeCount: clampBadgeCount(config.defaultBadgesCount || 3),
    badges: normalizeBadges(config.badges)
  };

  const els = {
    dataStatus: document.getElementById("dataStatus"),
    templateStatus: document.getElementById("templateStatus"),
    employeeSelect: document.getElementById("employeeSelect"),
    badgeCountGroup: document.getElementById("badgeCountGroup"),
    badgeEditor: document.getElementById("badgeEditor"),
    preview: document.getElementById("signaturePreview"),
    htmlOutput: document.getElementById("htmlOutput"),
    refreshData: document.getElementById("refreshData"),
    copyHtml: document.getElementById("copyHtml"),
    downloadHtml: document.getElementById("downloadHtml"),
    toggleCode: document.getElementById("toggleCode"),
    fields: Array.from(document.querySelectorAll("[data-field]"))
  };

  const defaultEmployee = {
    name: "Nombre Apellido",
    title: "Puesto de trabajo",
    phone: "+52 55 0000 0000",
    email: "correo@quitze.com",
    photo: "",
    website: company.website || "https://www.quitze.com/",
    websiteLabel: company.websiteLabel || "www.quitze.com",
    facebook: company.facebook || "",
    instagram: company.instagram || "",
    linkedin: company.linkedin || "",
    youtube: company.youtube || ""
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    renderBadgeEditor();
    wireEvents();
    updateBadgeCountButtons();
    await Promise.all([loadTemplate(), loadLogo()]);
    await loadEmployees();
    renderSignature();
  }

  function wireEvents() {
    els.refreshData.addEventListener("click", loadEmployees);
    els.copyHtml.addEventListener("click", copySignature);
    els.downloadHtml.addEventListener("click", downloadSignature);
    els.toggleCode.addEventListener("click", toggleCode);
    els.employeeSelect.addEventListener("change", function () {
      state.selectedIndex = Number(els.employeeSelect.value) || 0;
      fillForm(state.employees[state.selectedIndex] || defaultEmployee);
      renderSignature();
    });

    els.fields.forEach(function (input) {
      input.addEventListener("input", renderSignature);
    });

    els.badgeCountGroup.addEventListener("click", function (event) {
      const button = event.target.closest("button[data-count]");
      if (!button) return;
      state.badgeCount = clampBadgeCount(button.dataset.count);
      updateBadgeCountButtons();
      updateBadgeRowState();
      renderSignature();
    });
  }

  async function loadTemplate() {
    try {
      const response = await fetch("Firma(plantilla).htm", { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo leer la plantilla");
      state.template = await response.text();
      els.templateStatus.textContent = "Plantilla lista";
    } catch (error) {
      state.template = fallbackTemplate();
      els.templateStatus.textContent = "Plantilla interna activa";
    }
  }

  async function loadLogo() {
    if (!config.embedLocalLogo || !config.logoUrl) return;
    try {
      const response = await fetch(config.logoUrl, { cache: "force-cache" });
      if (!response.ok) throw new Error("Logo no disponible");
      const blob = await response.blob();
      state.logoDataUrl = await blobToDataUrl(blob);
    } catch (error) {
      state.logoDataUrl = "";
    }
  }

  async function loadEmployees() {
    setStatus("Buscando datos...");
    const sources = getDataSources();
    const failures = [];

    for (const source of sources) {
      try {
        const response = await fetch(source.url, { cache: "no-store" });
        if (!response.ok) {
          failures.push(source.label);
          continue;
        }
        const text = await response.text();
        const employees = source.type === "json" ? parseEmployeesJson(text) : parseEmployeesCsv(text);
        if (employees.length) {
          state.employees = employees;
          state.selectedIndex = 0;
          renderEmployeeOptions();
          fillForm(state.employees[0]);
          setStatus(source.label);
          renderSignature();
          return;
        }
        failures.push(source.label);
      } catch (error) {
        failures.push(source.label);
      }
    }

    state.employees = [defaultEmployee];
    state.selectedIndex = 0;
    renderEmployeeOptions();
    fillForm(defaultEmployee);
    setStatus(failures.length ? "Datos de ejemplo" : "Sin fuente");
    renderSignature();
  }

  function getDataSources() {
    const sources = [];
    if (config.googleDocsCsvUrl) {
      sources.push({
        url: config.googleDocsCsvUrl,
        type: "csv",
        label: "Google Docs"
      });
    }

    if (config.employeeDataUrl) {
      sources.push({
        url: config.employeeDataUrl,
        type: inferType(config.employeeDataUrl),
        label: "Datos configurados"
      });
    }

    (config.localAutoFiles || ["empleados.csv", "empleados.json"]).forEach(function (url) {
      sources.push({
        url: url,
        type: inferType(url),
        label: url
      });
    });

    return sources;
  }

  function renderEmployeeOptions() {
    els.employeeSelect.innerHTML = "";
    state.employees.forEach(function (employee, index) {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = employee.name || employee.email || "Empleado";
      els.employeeSelect.appendChild(option);
    });
    els.employeeSelect.value = String(state.selectedIndex);
  }

  function fillForm(employee) {
    const merged = Object.assign({}, defaultEmployee, company, employee);
    els.fields.forEach(function (input) {
      input.value = merged[input.dataset.field] || "";
    });

    const employeeBadges = extractEmployeeBadges(employee);
    if (employeeBadges.length) {
      state.badges = normalizeBadges(employeeBadges);
      renderBadgeEditor();
      updateBadgeCountButtons();
      updateBadgeRowState();
    }
  }

  function renderBadgeEditor() {
    els.badgeEditor.innerHTML = "";
    state.badges.forEach(function (badge, index) {
      const row = document.createElement("div");
      row.className = "badge-row";
      row.dataset.index = String(index);
      row.innerHTML = [
        '<div class="badge-number">' + (index + 1) + "</div>",
        '<div class="badge-fields">',
        badgeField("Texto", "label", badge.label || ""),
        badgeField("Imagen", "imageUrl", badge.imageUrl || ""),
        badgeField("Enlace", "linkUrl", badge.linkUrl || ""),
        "</div>"
      ].join("");
      row.querySelectorAll("input").forEach(function (input) {
        input.addEventListener("input", function () {
          const rowIndex = Number(row.dataset.index);
          state.badges[rowIndex][input.dataset.badgeField] = input.value;
          renderSignature();
        });
      });
      els.badgeEditor.appendChild(row);
    });
    updateBadgeRowState();
  }

  function badgeField(label, key, value) {
    const type = key === "label" ? "text" : "url";
    return [
      '<label class="field">',
      "<span>" + label + "</span>",
      '<input type="' + type + '" data-badge-field="' + key + '" value="' + escapeAttribute(value) + '" placeholder="' + (key === "label" ? "Badge" : "https://...") + '">',
      "</label>"
    ].join("");
  }

  function updateBadgeCountButtons() {
    els.badgeCountGroup.querySelectorAll("button").forEach(function (button) {
      button.classList.toggle("is-active", Number(button.dataset.count) === state.badgeCount);
    });
  }

  function updateBadgeRowState() {
    els.badgeEditor.querySelectorAll(".badge-row").forEach(function (row, index) {
      row.classList.toggle("is-disabled", index >= state.badgeCount);
    });
  }

  function renderSignature() {
    if (!state.template) return;
    const form = readForm();
    const logoUrl = state.logoDataUrl || config.logoUrl || "";
    const photoUrl = normalizeDriveUrl(form.photo) || makeInitialsAvatar(form.name);
    const replacements = {
      NOMBRE: form.name,
      PUESTO: form.title,
      TELEFONO: form.phone,
      TELEFONO_HREF: toTelHref(form.phone),
      CORREO: form.email,
      FOTO_URL: safeUrl(photoUrl),
      LOGO_URL: safeUrl(logoUrl),
      PAGINA_WEB: form.websiteLabel || form.website,
      PAGINA_WEB_URL: safeUrl(form.website),
      SOCIALES_HTML: buildSocialHtml(form),
      BADGES_HTML: buildBadgesHtml()
    };

    let html = state.template;
    Object.keys(replacements).forEach(function (key) {
      const value = key.endsWith("_HTML") ? replacements[key] : escapeHtml(replacements[key]);
      html = html.replaceAll("{{" + key + "}}", value || "");
    });

    state.html = html;
    els.preview.srcdoc = html;
    els.htmlOutput.value = html;
  }

  function readForm() {
    const data = {};
    els.fields.forEach(function (input) {
      data[input.dataset.field] = input.value.trim();
    });
    return Object.assign({}, defaultEmployee, data);
  }

  function buildSocialHtml(form) {
    const items = [
      ["Facebook", form.facebook],
      ["Instagram", form.instagram],
      ["LinkedIn", form.linkedin],
      ["YouTube", form.youtube]
    ].filter(function (item) {
      return Boolean(item[1]);
    });

    if (!items.length) return "";

    const cells = items.map(function (item) {
      return [
        '<td style="padding:0 6px 0 0;">',
        '<a href="' + escapeAttribute(safeUrl(item[1])) + '" style="display:inline-block;border:1px solid #e3e3e3;border-radius:4px;padding:4px 7px;font-size:11px;line-height:13px;color:#d71920;text-decoration:none;font-weight:700;">',
        escapeHtml(item[0]),
        "</a>",
        "</td>"
      ].join("");
    }).join("");

    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>' + cells + "</tr></table>";
  }

  function buildBadgesHtml() {
    const visibleBadges = state.badges.slice(0, state.badgeCount);
    if (!visibleBadges.length) return "";

    const cells = visibleBadges.map(function (badge) {
      const link = safeUrl(normalizeDriveUrl(badge.linkUrl));
      const image = safeUrl(normalizeDriveUrl(badge.imageUrl));
      const label = badge.label || "Badge";
      const content = image
        ? '<img src="' + escapeAttribute(image) + '" width="86" alt="' + escapeAttribute(label) + '" style="display:block;width:86px;max-width:86px;height:auto;border:0;">'
        : '<span style="display:inline-block;min-width:76px;border:1px solid #e4e4e4;border-left:3px solid #d71920;border-radius:4px;padding:7px 8px;background:#ffffff;color:#222222;font-size:11px;line-height:13px;font-weight:700;text-align:center;">' + escapeHtml(label) + "</span>";

      const wrapped = link
        ? '<a href="' + escapeAttribute(link) + '" style="display:inline-block;text-decoration:none;">' + content + "</a>"
        : content;

      return '<td style="padding:0 8px 0 0;vertical-align:middle;">' + wrapped + "</td>";
    }).join("");

    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>' + cells + "</tr></table>";
  }

  async function copySignature() {
    if (!state.html) renderSignature();
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([state.html], { type: "text/html" }),
            "text/plain": new Blob([htmlToText(state.html)], { type: "text/plain" })
          })
        ]);
      } else {
        copyViaSelection(state.html);
      }
      els.copyHtml.querySelector("span:last-child").textContent = "Copiado";
      window.setTimeout(function () {
        els.copyHtml.querySelector("span:last-child").textContent = "Copiar";
      }, 1400);
    } catch (error) {
      copyViaSelection(state.html);
    }
  }

  function copyViaSelection(html) {
    const container = document.createElement("div");
    container.setAttribute("contenteditable", "true");
    container.style.position = "fixed";
    container.style.left = "-9999px";
    container.innerHTML = html;
    document.body.appendChild(container);

    const range = document.createRange();
    range.selectNodeContents(container);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("copy");
    selection.removeAllRanges();
    container.remove();
  }

  function downloadSignature() {
    if (!state.html) renderSignature();
    const form = readForm();
    const blob = new Blob([state.html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "firma-" + slugify(form.name || "empleado") + ".htm";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function toggleCode() {
    els.htmlOutput.classList.toggle("is-visible");
  }

  function parseEmployeesJson(text) {
    const parsed = JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : parsed.empleados || parsed.employees || [];
    return rows.map(normalizeEmployee).filter(hasEmployeeData);
  }

  function parseEmployeesCsv(text) {
    const rows = splitCsvRows(text.replace(/^\uFEFF/, ""));
    if (rows.length < 2) return [];
    const headers = rows[0].map(normalizeKey);
    return rows.slice(1).map(function (row) {
      const data = {};
      headers.forEach(function (header, index) {
        data[header] = row[index] || "";
      });
      return normalizeEmployee(data);
    }).filter(hasEmployeeData);
  }

  function splitCsvRows(text) {
    const delimiter = detectDelimiter(text);
    const rows = [];
    let row = [];
    let value = "";
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];

      if (char === '"' && quoted && next === '"') {
        value += '"';
        index += 1;
        continue;
      }

      if (char === '"') {
        quoted = !quoted;
        continue;
      }

      if (char === delimiter && !quoted) {
        row.push(value.trim());
        value = "";
        continue;
      }

      if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && next === "\n") index += 1;
        row.push(value.trim());
        if (row.some(Boolean)) rows.push(row);
        row = [];
        value = "";
        continue;
      }

      value += char;
    }

    row.push(value.trim());
    if (row.some(Boolean)) rows.push(row);
    return rows;
  }

  function detectDelimiter(text) {
    const firstLine = text.split(/\r?\n/)[0] || "";
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    return semicolonCount > commaCount ? ";" : ",";
  }

  function normalizeEmployee(row) {
    const source = Object.keys(row).reduce(function (acc, key) {
      acc[normalizeKey(key)] = row[key];
      return acc;
    }, {});

    const employee = {
      name: pick(source, ["nombre", "name", "empleado", "colaborador"]),
      title: pick(source, ["puesto", "cargo", "title", "trabajo"]),
      phone: pick(source, ["telefono", "tel", "phone", "celular", "movil"]),
      email: pick(source, ["correo", "email", "mail", "e_mail"]),
      photo: pick(source, ["foto", "fotografia", "photo", "avatar", "imagen"]),
      website: pick(source, ["pagina_web", "pagina", "web", "sitio", "website"]) || company.website || "",
      websiteLabel: pick(source, ["texto_pagina", "pagina_texto", "web_texto", "website_label"]) || company.websiteLabel || "",
      facebook: pick(source, ["facebook", "fb"]) || company.facebook || "",
      instagram: pick(source, ["instagram", "ig"]) || company.instagram || "",
      linkedin: pick(source, ["linkedin", "linked_in"]) || company.linkedin || "",
      youtube: pick(source, ["youtube", "yt"]) || company.youtube || ""
    };

    for (let index = 1; index <= 6; index += 1) {
      employee["badge" + index + "Label"] = pick(source, ["badge" + index + "_label", "badge" + index, "insignia" + index, "certificacion" + index]);
      employee["badge" + index + "Image"] = pick(source, ["badge" + index + "_image", "badge" + index + "_imagen", "badge" + index + "_img"]);
      employee["badge" + index + "Link"] = pick(source, ["badge" + index + "_link", "badge" + index + "_url", "badge" + index + "_enlace"]);
    }

    return employee;
  }

  function extractEmployeeBadges(employee) {
    const badges = [];
    for (let index = 1; index <= 6; index += 1) {
      badges.push({
        label: employee["badge" + index + "Label"] || state.badges[index - 1].label || "",
        imageUrl: employee["badge" + index + "Image"] || state.badges[index - 1].imageUrl || "",
        linkUrl: employee["badge" + index + "Link"] || state.badges[index - 1].linkUrl || ""
      });
    }
    return badges.filter(function (badge) {
      return badge.label || badge.imageUrl || badge.linkUrl;
    });
  }

  function normalizeBadges(badges) {
    const normalized = Array.isArray(badges) ? badges.slice(0, 6) : [];
    while (normalized.length < 6) {
      normalized.push({ label: "Badge " + (normalized.length + 1), imageUrl: "", linkUrl: "" });
    }
    return normalized.map(function (badge, index) {
      return {
        label: badge.label || "Badge " + (index + 1),
        imageUrl: badge.imageUrl || badge.image || badge.url || "",
        linkUrl: badge.linkUrl || badge.link || ""
      };
    });
  }

  function pick(source, keys) {
    for (const key of keys) {
      const value = source[normalizeKey(key)];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return String(value).trim();
      }
    }
    return "";
  }

  function normalizeKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function hasEmployeeData(employee) {
    return Boolean(employee.name || employee.email || employee.phone);
  }

  function inferType(url) {
    return /\.json(?:$|\?)/i.test(url) ? "json" : "csv";
  }

  function setStatus(text) {
    els.dataStatus.textContent = text;
  }

  function clampBadgeCount(value) {
    const number = Number(value) || 3;
    return Math.min(6, Math.max(3, number));
  }

  function normalizeDriveUrl(url) {
    const value = String(url || "").trim();
    const match = value.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    if (match) return "https://drive.google.com/uc?export=view&id=" + match[1];
    return value;
  }

  function safeUrl(url) {
    const value = String(url || "").trim();
    if (!value) return "";
    if (/^(https?:|mailto:|tel:|data:image\/|assets\/|\.\/|\/)/i.test(value)) return value;
    return "";
  }

  function toTelHref(phone) {
    return String(phone || "").replace(/[^\d+]/g, "");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function makeInitialsAvatar(name) {
    const initials = String(name || "Q")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(function (part) { return part[0] || ""; })
      .join("")
      .toUpperCase() || "Q";
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">',
      '<rect width="96" height="96" rx="6" fill="#f7f7f7"/>',
      '<rect x="2" y="2" width="92" height="92" rx="5" fill="#ffffff" stroke="#d71920" stroke-width="3"/>',
      '<text x="48" y="57" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="#d71920">' + escapeHtml(initials) + "</text>",
      "</svg>"
    ].join("");
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function htmlToText(html) {
    const element = document.createElement("div");
    element.innerHTML = html;
    return element.textContent.replace(/\s{3,}/g, "\n").trim();
  }

  function slugify(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "firma";
  }

  function fallbackTemplate() {
    return [
      "<!doctype html><html><head><meta charset=\"utf-8\"><title>Firma Quitze</title></head><body>",
      "<table style=\"font-family:Arial,Helvetica,sans-serif;border-left:5px solid #d71920;padding-left:16px;\"><tr>",
      "<td><img src=\"{{FOTO_URL}}\" width=\"96\" height=\"96\" alt=\"{{NOMBRE}}\"></td>",
      "<td style=\"padding:0 16px;\"><strong style=\"font-size:22px;color:#111111;\">{{NOMBRE}}</strong><br>",
      "<span style=\"color:#d71920;font-weight:700;\">{{PUESTO}}</span><br>",
      "{{TELEFONO}}<br>{{CORREO}}<br>{{PAGINA_WEB}}<br>{{SOCIALES_HTML}}</td>",
      "<td><img src=\"{{LOGO_URL}}\" width=\"180\" alt=\"Quitze Soluciones\"></td></tr><tr><td colspan=\"3\">{{BADGES_HTML}}</td></tr></table>",
      "</body></html>"
    ].join("");
  }
}());
