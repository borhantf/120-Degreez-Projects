const STORAGE_KEY = "120-degreez-pwa-data-v1";
const PREFS_KEY = "120-degreez-pwa-prefs-v1";
const GOOGLE_SHEET_ID = "1bK1rReW07p2nCorcAOsQM3FQappKEwy6mqnZBZdwhH0";
const GOOGLE_SHEET_GID = "840894697";

const state = {
  allProjects: [],
  currentItems: [],
  favorites: {},
  recentProjects: [],
  selectedIndex: -1,
  darkMode: false,
  favoritesOnly: false,
  sortField: "",
  sortAsc: true,
};

const els = {};

document.addEventListener("DOMContentLoaded", initApp);

function initApp() {
  bindElements();
  loadPrefs();
  loadProjects();
  bindEvents();
  applyTheme();
  render();
  registerServiceWorker();

  if (!state.allProjects.length) {
    syncFromGoogleSheet({ silentOnFailure: true });
  }
}

function bindElements() {
  [
    "searchBox",
    "clearSearchBtn",
    "favOnlyBtn",
    "themeBtn",
    "syncSheetBtn",
    "csvInput",
    "exportFilteredBtn",
    "exportAllBtn",
    "projectList",
    "projectCount",
    "recentPill",
    "dashTotal",
    "dashFav",
    "dashRecent",
    "dashSelected",
    "statusMsg",
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
  els.searchBox.addEventListener("input", render);
  els.clearSearchBtn.addEventListener("click", () => {
    els.searchBox.value = "";
    render();
    els.searchBox.focus();
  });
  els.favOnlyBtn.addEventListener("click", () => {
    state.favoritesOnly = !state.favoritesOnly;
    savePrefs();
    render();
  });
  els.themeBtn.addEventListener("click", () => {
    state.darkMode = !state.darkMode;
    savePrefs();
    applyTheme();
    showStatus(state.darkMode ? "Light mode enabled." : "Dark mode enabled.", "success");
  });
  els.syncSheetBtn.addEventListener("click", () => syncFromGoogleSheet());
  els.csvInput.addEventListener("change", importCsvFromFile);
  els.exportFilteredBtn.addEventListener("click", () => exportCsv(state.currentItems, "filtered"));
  els.exportAllBtn.addEventListener("click", () => exportCsv(state.allProjects, "all"));

  document.querySelectorAll("[data-sort]").forEach((button) => {
    button.addEventListener("click", () => toggleSort(button.dataset.sort));
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      syncFromGoogleSheet({ silentOnFailure: true });
    }
  });

  window.addEventListener("focus", () => {
    syncFromGoogleSheet({ silentOnFailure: true });
  });
}

function loadPrefs() {
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    state.darkMode = !!prefs.darkMode;
    state.favorites = prefs.favorites || {};
    state.recentProjects = prefs.recentProjects || [];
    state.favoritesOnly = !!prefs.favoritesOnly;
    state.sortField = prefs.sortField || "";
    state.sortAsc = prefs.sortAsc !== false;
  } catch (error) {
    console.warn("Unable to load preferences", error);
  }
}

function savePrefs() {
  localStorage.setItem(
    PREFS_KEY,
    JSON.stringify({
      darkMode: state.darkMode,
      favorites: state.favorites,
      recentProjects: state.recentProjects,
      favoritesOnly: state.favoritesOnly,
      sortField: state.sortField,
      sortAsc: state.sortAsc,
    })
  );
}

function loadProjects() {
  try {
    state.allProjects = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (error) {
    state.allProjects = [];
  }
}

function saveProjects() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.allProjects));
}

function applyTheme() {
  document.body.classList.toggle("dark", state.darkMode);
  els.themeBtn.textContent = state.darkMode ? "Light Mode" : "Theme";
  els.favOnlyBtn.classList.toggle("active", state.favoritesOnly);
}

function favoriteKey(project) {
  return `${project.number}|${project.name}|${project.path}`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1] || "";

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        value += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(value);
      if (row.some((cell) => cell !== "")) {
        rows.push(row);
      }
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  if (value.length || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function csvEscape(value) {
  const text = String(value || "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function importCsvFromFile(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const rows = parseCsv(String(reader.result || ""));
    const projects = rowsToProjects(rows.slice(1));
    state.allProjects = projects;
    state.selectedIndex = -1;
    saveProjects();
    render();
    showStatus(`Imported ${projects.length} projects.`, "success");
    els.csvInput.value = "";
  };
  reader.readAsText(file);
}

async function syncFromGoogleSheet(options = {}) {
  const { silentOnFailure = false } = options;

  try {
    showStatus("Loading projects from Google Sheets...", "warn");
    const rows = await loadGoogleSheetRows();
    const projects = rowsToProjects(rows);
    state.allProjects = projects;
    state.selectedIndex = -1;
    saveProjects();
    render();
    showStatus(`Synced ${projects.length} projects.`, "success");
  } catch (error) {
    console.warn("Google Sheets sync failed", error);
    if (!silentOnFailure) {
      showStatus("Could not load Google Sheets.", "error");
    } else if (!state.allProjects.length) {
      showStatus("Google Sheets sync is ready, but no data loaded yet.", "warn");
    }
  }
}

function loadGoogleSheetRows() {
  return new Promise((resolve, reject) => {
    const callbackName = `sheetQuery_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Google Sheets request timed out"));
    }, 15000);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (response) => {
      try {
        cleanup();
        const table = response?.table;
        if (!table || !Array.isArray(table.rows)) {
          reject(new Error("Invalid Google Sheets response"));
          return;
        }

        const rows = table.rows.map((row) =>
          (row.c || []).map((cell) => (cell && cell.v != null ? String(cell.v) : ""))
        );
        resolve(rows);
      } catch (error) {
        reject(error);
      }
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Unable to load Google Sheets script"));
    };

    script.src = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?gid=${GOOGLE_SHEET_GID}&headers=1&tqx=responseHandler:${callbackName}`;
    document.body.appendChild(script);
  });
}

function rowsToProjects(rows) {
  return rows
    .filter((row) => row.length >= 3)
    .map((row) => ({
      number: String(row[0] || "").trim(),
      name: String(row[1] || "").trim(),
      path: String(row[2] || "").trim(),
    }))
    .filter((project) => project.number || project.name || project.path);
}

function exportCsv(items, label) {
  const content = [
    "Project Number,Project Name,Project Path",
    ...items.map((project) =>
      `${csvEscape(project.number)},${csvEscape(project.name)},${csvEscape(project.path)}`
    ),
  ].join("\r\n");

  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `120degreez-${label}-${timestamp()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showStatus(`Exported ${items.length} projects.`, "success");
}

function timestamp() {
  const d = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
    "-",
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds()),
  ].join("");
}

function filteredProjects() {
  const query = els.searchBox.value.trim().toLowerCase();
  let items = [...state.allProjects];

  if (query) {
    items = items
      .map((project) => ({
        project,
        score: fuzzyScore(project, query),
      }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.project);
  }

  if (state.favoritesOnly) {
    items = items.filter((project) => state.favorites[favoriteKey(project)]);
  }

  if (state.sortField) {
    const field = state.sortField;
    const multiplier = state.sortAsc ? 1 : -1;
    items.sort((a, b) => String(a[field]).localeCompare(String(b[field])) * multiplier);
  }

  return items;
}

function fuzzyScore(project, query) {
  const haystack = `${project.number} ${project.name} ${project.path}`.toLowerCase();
  return query.split(/\s+/).reduce((score, part) => {
    if (!part) {
      return score;
    }

    const index = haystack.indexOf(part);
    if (index < 0) {
      return -1;
    }

    return score + 100 - Math.min(index, 90);
  }, 0);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(value, query) {
  const safe = escapeHtml(value);
  const trimmed = String(query || "").trim();
  if (!trimmed) {
    return safe;
  }

  const parts = trimmed.split(/\s+/).filter(Boolean).map((part) => escapeRegex(part));
  if (!parts.length) {
    return safe;
  }

  try {
    return safe.replace(new RegExp(`(${parts.join("|")})`, "ig"), '<span class="hl">$1</span>');
  } catch (error) {
    return safe;
  }
}

function render() {
  state.currentItems = filteredProjects();
  renderList();
  renderDashboard();
  applyTheme();
}

function renderList() {
  els.projectList.innerHTML = "";
  const query = els.searchBox.value.trim();
  els.projectCount.textContent = `${state.currentItems.length} project${state.currentItems.length === 1 ? "" : "s"}`;
  els.recentPill.textContent = state.recentProjects[0] ? `Recent: ${state.recentProjects[0]}` : "Ready";
  els.recentPill.title = state.recentProjects[0] || "Ready";

  if (!state.currentItems.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = state.allProjects.length
      ? "No matching project found."
      : "No projects loaded yet.";
    els.projectList.appendChild(empty);
    return;
  }

  const template = document.getElementById("projectRowTemplate");

  state.currentItems.forEach((project, filteredIndex) => {
    const node = template.content.firstElementChild.cloneNode(true);
    const key = favoriteKey(project);
    const favoriteBtn = node.querySelector(".favorite-btn");
    const copyBtn = node.querySelector(".copy-btn");

    node.classList.toggle("selected", filteredIndex === state.selectedIndex);
    node.querySelector(".project-number").innerHTML = highlightText(project.number, query);
    node.querySelector(".project-name").innerHTML = highlightText(project.name, query);
    node.querySelector(".project-path").innerHTML = highlightText(project.path, query);

    favoriteBtn.textContent = state.favorites[key] ? "★" : "☆";
    favoriteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      state.favorites[key] = !state.favorites[key];
      savePrefs();
      render();
    });

    node.addEventListener("click", () => {
      state.selectedIndex = filteredIndex;
      rememberRecent(project);
      savePrefs();
      render();
    });

    copyBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      await copyText(project.path);
    });

    els.projectList.appendChild(node);
  });
}

function renderDashboard() {
  const favCount = Object.values(state.favorites).filter(Boolean).length;
  els.dashTotal.textContent = String(state.allProjects.length);
  els.dashFav.textContent = String(favCount);
  els.dashRecent.textContent = state.recentProjects[0] || "None";
  els.dashSelected.textContent = state.currentItems[state.selectedIndex]?.number || "None";
}

function rememberRecent(project) {
  const label = `${project.number} - ${project.name}`;
  state.recentProjects = [label, ...state.recentProjects.filter((item) => item !== label)].slice(0, 5);
}

async function copyText(text, successMessage = "Copied to clipboard.") {
  try {
    await navigator.clipboard.writeText(text);
    showStatus(successMessage, "success");
  } catch (error) {
    showStatus("Clipboard access failed on this device.", "warn");
  }
}

function toggleSort(field) {
  if (state.sortField === field) {
    state.sortAsc = !state.sortAsc;
  } else {
    state.sortField = field;
    state.sortAsc = true;
  }

  savePrefs();
  render();
  showStatus(`Sorted by ${field}.`, "success");
}

function showStatus(message, kind = "") {
  els.statusMsg.hidden = !message;
  els.statusMsg.className = `status global-status ${kind}`.trim();
  els.statusMsg.textContent = message;
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((error) => {
        console.warn("Service worker registration failed", error);
      });
    });
  }
}
