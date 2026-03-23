const STORAGE_KEY = "120-degreez-pwa-data-v1";
const PREFS_KEY = "120-degreez-pwa-prefs-v1";
const GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/1bK1rReW07p2nCorcAOsQM3FQappKEwy6mqnZBZdwhH0/export?format=csv&gid=0";

const state = {
  allProjects: [],
  currentItems: [],
  favorites: {},
  recentProjects: [],
  selectedIndex: -1,
  editIndex: -1,
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
    "projNumber",
    "projName",
    "projPath",
    "addBtn",
    "updateBtn",
    "clearBtn",
    "editModeText",
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
    showStatus(state.darkMode ? "Dark mode enabled." : "Light mode enabled.", "success");
  });
  els.syncSheetBtn.addEventListener("click", () => syncFromGoogleSheet());
  els.csvInput.addEventListener("change", importCsvFromFile);
  els.exportFilteredBtn.addEventListener("click", () => exportCsv(state.currentItems, "filtered"));
  els.exportAllBtn.addEventListener("click", () => exportCsv(state.allProjects, "all"));
  els.addBtn.addEventListener("click", addProject);
  els.updateBtn.addEventListener("click", updateProject);
  els.clearBtn.addEventListener("click", clearForm);
  [els.projNumber, els.projName, els.projPath].forEach((input) => {
    input.addEventListener("input", updateFormState);
  });
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
  const prefs = {
    darkMode: state.darkMode,
    favorites: state.favorites,
    recentProjects: state.recentProjects,
    favoritesOnly: state.favoritesOnly,
    sortField: state.sortField,
    sortAsc: state.sortAsc,
  };
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
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
  els.themeBtn.textContent = state.darkMode ? "Light Mode" : "Dark Mode";
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
    const projects = [];

    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row || row.length < 3) {
        continue;
      }
      projects.push({
        number: row[0].trim(),
        name: row[1].trim(),
        path: row[2].trim(),
      });
    }

    state.allProjects = projects;
    state.selectedIndex = -1;
    state.editIndex = -1;
    saveProjects();
    render();
    clearForm();
    showStatus(`Imported ${projects.length} projects from CSV.`, "success");
    els.csvInput.value = "";
  };
  reader.readAsText(file);
}

async function syncFromGoogleSheet(options = {}) {
  const { silentOnFailure = false } = options;

  try {
    showStatus("Loading projects from Google Sheets...", "warn");
    const response = await fetch(GOOGLE_SHEET_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Google Sheets returned ${response.status}`);
    }

    const text = await response.text();
    const rows = parseCsv(text);
    const projects = [];

    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row || row.length < 3) {
        continue;
      }

      const number = String(row[0] || "").trim();
      const name = String(row[1] || "").trim();
      const path = String(row[2] || "").trim();

      if (!number && !name && !path) {
        continue;
      }

      projects.push({ number, name, path });
    }

    state.allProjects = projects;
    state.selectedIndex = -1;
    state.editIndex = -1;
    saveProjects();
    render();
    clearForm();
    showStatus(`Synced ${projects.length} projects from Google Sheets.`, "success");
  } catch (error) {
    console.warn("Google Sheets sync failed", error);
    if (!silentOnFailure) {
      showStatus(
        "Could not load Google Sheets. Make sure the sheet is shared for viewing and the first tab has Project Number, Project Name, and Project Path columns.",
        "error"
      );
    } else if (!state.allProjects.length) {
      showStatus(
        "Google Sheets sync is ready, but the sheet must allow viewer access before the iPhone can load it.",
        "warn"
      );
    }
  }
}

function exportCsv(items, label) {
  const content = [
    "Project Number,Project Name,Project Path",
    ...items.map((project) => (
      `${csvEscape(project.number)},${csvEscape(project.name)},${csvEscape(project.path)}`
    )),
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

function render() {
  state.currentItems = filteredProjects();
  renderList();
  renderDashboard();
  applyTheme();
  updateFormState();
}

function renderList() {
  els.projectList.innerHTML = "";
  els.projectCount.textContent = `${state.currentItems.length} project${state.currentItems.length === 1 ? "" : "s"}`;
  els.recentPill.textContent = state.recentProjects[0] ? `Recent: ${state.recentProjects[0]}` : "Ready";

  if (!state.currentItems.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = state.allProjects.length
      ? "No matching project found."
      : "No projects loaded yet. Import your CSV to start using the PWA.";
    els.projectList.appendChild(empty);
    return;
  }

  const template = document.getElementById("projectRowTemplate");

  state.currentItems.forEach((project, filteredIndex) => {
    const node = template.content.firstElementChild.cloneNode(true);
    const key = favoriteKey(project);
    node.classList.toggle("selected", filteredIndex === state.selectedIndex);
    node.querySelector(".project-number").textContent = project.number;
    node.querySelector(".project-name").textContent = project.name;
    node.querySelector(".project-path").textContent = project.path;

    const favoriteBtn = node.querySelector(".favorite-btn");
    favoriteBtn.textContent = state.favorites[key] ? "★" : "☆";
    favoriteBtn.addEventListener("click", () => {
      state.favorites[key] = !state.favorites[key];
      savePrefs();
      render();
    });

    node.addEventListener("click", () => {
      state.selectedIndex = filteredIndex;
      render();
    });

    node.querySelector(".open-btn").addEventListener("click", (event) => {
      event.stopPropagation();
      openProject(project, filteredIndex);
    });
    node.querySelector(".copy-btn").addEventListener("click", async (event) => {
      event.stopPropagation();
      await copyText(project.path);
    });
    node.querySelector(".edit-btn").addEventListener("click", (event) => {
      event.stopPropagation();
      startEdit(project);
    });
    node.querySelector(".delete-btn").addEventListener("click", (event) => {
      event.stopPropagation();
      deleteProject(project);
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

function openProject(project, filteredIndex) {
  rememberRecent(project);
  state.selectedIndex = filteredIndex;
  savePrefs();
  render();

  if (/^https?:\/\//i.test(project.path)) {
    window.open(project.path, "_blank", "noopener,noreferrer");
    showStatus(`Opened ${project.number}.`, "success");
    return;
  }

  if (navigator.share) {
    navigator.share({
      title: `${project.number} - ${project.name}`,
      text: project.path,
    }).catch(() => {});
  }

  copyText(project.path, `Copied path for ${project.number}.`);
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

function startEdit(project) {
  state.editIndex = state.allProjects.findIndex((entry) => (
    entry.number === project.number &&
    entry.name === project.name &&
    entry.path === project.path
  ));

  if (state.editIndex < 0) {
    showStatus("Unable to find the selected project.", "error");
    return;
  }

  els.projNumber.value = state.allProjects[state.editIndex].number;
  els.projName.value = state.allProjects[state.editIndex].name;
  els.projPath.value = state.allProjects[state.editIndex].path;
  els.editModeText.textContent = "Edit Mode";
  updateFormState();
  showStatus("Project loaded for editing.", "success");
}

function clearForm() {
  els.projNumber.value = "";
  els.projName.value = "";
  els.projPath.value = "";
  state.editIndex = -1;
  els.editModeText.textContent = "Add Mode";
  updateFormState();
}

function readFormProject() {
  return {
    number: els.projNumber.value.trim(),
    name: els.projName.value.trim(),
    path: els.projPath.value.trim(),
  };
}

function validateProject(project) {
  if (!project.number || !project.name || !project.path) {
    showStatus("Project number, name, and path are required.", "error");
    return false;
  }
  return true;
}

function addProject() {
  const project = readFormProject();
  if (!validateProject(project)) {
    return;
  }
  state.allProjects.push(project);
  saveProjects();
  clearForm();
  render();
  showStatus("Project added successfully.", "success");
}

function updateProject() {
  if (state.editIndex < 0) {
    showStatus("Select a project to edit first.", "warn");
    return;
  }
  const project = readFormProject();
  if (!validateProject(project)) {
    return;
  }
  state.allProjects[state.editIndex] = project;
  saveProjects();
  clearForm();
  render();
  showStatus("Project updated successfully.", "success");
}

function deleteProject(project) {
  const matchIndex = state.allProjects.findIndex((entry) => (
    entry.number === project.number &&
    entry.name === project.name &&
    entry.path === project.path
  ));

  if (matchIndex < 0) {
    showStatus("Unable to find the selected project.", "error");
    return;
  }

  state.allProjects.splice(matchIndex, 1);
  saveProjects();
  clearForm();
  render();
  showStatus("Project deleted successfully.", "success");
}

function updateFormState() {
  const hasValues = [els.projNumber.value, els.projName.value, els.projPath.value].some((value) => value.trim());
  els.updateBtn.disabled = state.editIndex < 0;
  els.clearBtn.disabled = !hasValues && state.editIndex < 0;
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
  els.statusMsg.className = `status ${kind}`.trim();
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
