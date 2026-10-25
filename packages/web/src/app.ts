// Browser entry point of the web app. The build (build.ts) defines __PLAYER_SCRIPT__ and __SAMPLES__.
import { compileProject, load, toModule } from "@bytecat/compiler";
import { costumeAssets, createPlayer, mimeType, pageHtml, type Player } from "@bytecat/player";
import { compile as compilePseudo, PseudoError } from "@bytecat/pseudo";
import { readSb3, writeSb3, type Project } from "@bytecat/sb3";

interface Sample {
  name: string;
  source: string;
}

declare const __PLAYER_SCRIPT__: string;
declare const __SAMPLES__: Sample[];

/** A compiled project, ready to play. */
interface Loaded {
  name: string;
  project: Project;
  /** The original file, for .sb3 downloads of an opened project. */
  sb3?: Uint8Array;
  code: string;
  warnings: string[];
  compileMs: number;
}

/** What tests (and curious users) can reach from the console. */
export interface App {
  readonly player: Player | null;
  readonly loaded: Loaded | null;
  run(): Promise<void>;
  openFile(file: File): Promise<void>;
}

declare global {
  interface Window {
    bytecatApp: App;
  }
}

const DRAFT_KEY = "bytecat.draft";
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const editor = $<HTMLTextAreaElement>("editor");
const gutter = $("gutter");
const editorWrap = $("editor-wrap");
const fileCard = $("file-card");
const errorBox = $("error");
const status = $("status");
const canvas = $<HTMLCanvasElement>("stage");
const samples = $<HTMLSelectElement>("samples");
const fileInput = $<HTMLInputElement>("file");
const downloadMenu = $("download-menu");

let mode: "editor" | "file" = "editor";
let sampleName = "untitled";
/** Source text of the last successful pseudocode compile, to skip recompiling unchanged code. */
let compiledSource: string | null = null;
let loaded: Loaded | null = null;
let player: Player | null = null;
let blobUrls: string[] = [];
/** Bumped by every startPlayer call; a start that finishes after a newer one began is discarded. */
let generation = 0;
let errorLine = 0;
let assetErrors: string[] = [];

// ---- storage (best effort: private windows can refuse it) ----

function saveDraft(): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ name: sampleName, source: editor.value }));
  } catch {}
}

function readDraft(): Sample | null {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as Sample | null;
    return draft && typeof draft.source === "string" ? draft : null;
  } catch {
    return null;
  }
}

// ---- editor ----

function renderGutter(): void {
  const lines = editor.value.split("\n").length;
  let html = "";
  for (let i = 1; i <= lines; i++) html += i === errorLine ? `<span class="bad">${i}</span>` : `${i}\n`;
  gutter.innerHTML = html;
  gutter.scrollTop = editor.scrollTop;
}

function setSource(name: string, source: string): void {
  sampleName = name;
  editor.value = source;
  compiledSource = null;
  showError(null);
  showEditor();
  saveDraft();
}

function showEditor(): void {
  mode = "editor";
  editorWrap.hidden = false;
  fileCard.hidden = true;
  $("source-title").textContent = `Pseudocode: ${sampleName}`;
  renderGutter();
}

/** Moves the cursor to a 1-based line and column and scrolls it into view. */
function goTo(line: number, col: number): void {
  const lines = editor.value.split("\n");
  let offset = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) offset += lines[i]!.length + 1;
  offset += Math.max(0, col - 1);
  editor.focus();
  editor.setSelectionRange(offset, offset);
  const lineHeight = 20;
  editor.scrollTop = Math.max(0, (line - 4) * lineHeight);
}

function showError(message: string | null, line = 0, col = 1): void {
  errorLine = line;
  errorBox.hidden = message === null;
  errorBox.textContent = message ?? "";
  errorBox.onclick = line ? () => goTo(line, col) : null;
  renderGutter();
}

editor.addEventListener("input", () => {
  if (errorLine) showError(null);
  renderGutter();
  saveDraft();
});
editor.addEventListener("scroll", () => (gutter.scrollTop = editor.scrollTop));
editor.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    void run();
  } else if (e.key === "Tab" && !e.shiftKey) {
    // Indentation matters in pseudocode, so Tab inserts two spaces instead of leaving the editor.
    e.preventDefault();
    const { selectionStart: s, selectionEnd: end } = editor;
    editor.setRangeText("  ", s, end, "end");
    editor.dispatchEvent(new Event("input"));
  }
});

// ---- compiling and playing ----

function countBlocks(project: Project): number {
  return project.json.targets.reduce((n, t) => n + Object.keys(t.blocks).length, 0);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Compiles a project to JavaScript; returns null (and shows why) if the compiler fails. */
function compileLoaded(name: string, project: Project, sb3?: Uint8Array): Loaded | null {
  const start = performance.now();
  try {
    const { code, warnings } = compileProject(project.json);
    return { name, project, code, warnings, compileMs: performance.now() - start, ...(sb3 ? { sb3 } : {}) };
  } catch (e) {
    showError(`Could not compile ${name}: ${(e as Error).message}`);
    return null;
  }
}

/** Compiles the editor's pseudocode. Returns false and shows the error on bad input. */
function compileEditor(): boolean {
  const source = editor.value;
  if (loaded && compiledSource === source) return true;
  let project: Project;
  try {
    project = compilePseudo(source, `${sampleName}.sbp`).project;
  } catch (e) {
    if (e instanceof PseudoError) {
      showError(e.format(source), e.pos.line, e.pos.col);
      setStatus("Fix the error to run");
      return false;
    }
    throw e;
  }
  showError(null);
  const result = compileLoaded(sampleName, project);
  if (!result) return false;
  loaded = result;
  compiledSource = source;
  return true;
}

function setStatus(text: string): void {
  status.textContent = text;
}

function updateStatus(): void {
  if (!loaded) return;
  const sprites = loaded.project.json.targets.length - 1;
  const running = player?.rt.running ?? false;
  status.classList.toggle("running", running);
  setStatus(
    `${running ? "Running" : "Stopped"} · ${plural(sprites, "sprite")}, ${plural(countBlocks(loaded.project), "block")} · compiled in ${loaded.compileMs.toFixed(0)} ms`,
  );
}

/**
 * Replaces the player with a new one for the loaded project. Returns null if another call started
 * while this one was loading costumes: that newer call owns the canvas, and this player is dropped.
 */
async function startPlayer(): Promise<Player | null> {
  const gen = ++generation;
  player?.dispose();
  player = null;
  for (const url of blobUrls) URL.revokeObjectURL(url);
  blobUrls = [];
  const urls: string[] = [];
  const errors: string[] = [];
  const { project, code } = loaded!;
  const assets: Record<string, string> = {};
  for (const [name, data] of costumeAssets(project)) {
    const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mimeType(name) }));
    urls.push(url);
    assets[name] = url;
  }
  document.querySelectorAll(".bytecat-ask").forEach((el) => el.remove());
  const created = await createPlayer({
    canvas,
    project: project.json,
    program: load(code),
    assets,
    onAssetError: (name) => errors.push(name),
  });
  if (gen !== generation) {
    created.dispose();
    for (const url of urls) URL.revokeObjectURL(url);
    return null;
  }
  player = created;
  blobUrls = urls;
  assetErrors = errors;
  renderPanels();
  return created;
}

/** Compiles if needed, (re)creates the player for a new compile, then clicks the green flag. */
async function run(): Promise<void> {
  let current = player;
  if (mode === "editor") {
    const before = loaded;
    if (!compileEditor()) return;
    if (loaded !== before || !current) current = await startPlayer();
  } else if (!current) {
    if (!loaded) return;
    current = await startPlayer();
  }
  // Null when a newer start replaced this one; that start's own run clicks the flag.
  if (!current) return;
  current.greenFlag();
  canvas.focus();
  updateStatus();
}

function stop(): void {
  player?.stop();
  updateStatus();
}

async function openFile(file: File): Promise<void> {
  const name = file.name.replace(/\.(sb3|sbp|txt)$/i, "") || "project";
  if (!/\.sb3$/i.test(file.name)) {
    setSource(name, await file.text());
    if (compileEditor()) {
      await startPlayer();
      updateStatus();
    }
    return;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let project: Project;
  try {
    project = readSb3(bytes);
  } catch (e) {
    showError(`${file.name} is not a Scratch 3 project: ${(e as Error).message}`);
    return;
  }
  const result = compileLoaded(name, project, bytes);
  if (!result) return;
  showError(null);
  loaded = result;
  compiledSource = null;
  mode = "file";
  editorWrap.hidden = true;
  fileCard.hidden = false;
  $("source-title").textContent = "Scratch project";
  $("file-name").textContent = file.name;
  $("file-info").textContent = `${plural(project.json.targets.length - 1, "sprite")}, ${plural(countBlocks(project), "block")}. Press Run to start it.`;
  await startPlayer();
  updateStatus();
}

// ---- panels ----

let shownLog: string[] = [];

function renderOutput(force = false): void {
  const log = player?.rt.log() ?? [];
  if (!force && log.length === shownLog.length && log.every((l, i) => l === shownLog[i])) return;
  shownLog = log;
  const list = $("output");
  list.replaceChildren(...log.map((line) => Object.assign(document.createElement("li"), { textContent: line })));
  list.scrollTop = list.scrollHeight;
  $("output-empty").hidden = log.length > 0;
  const count = $("output-count");
  count.hidden = log.length === 0;
  count.textContent = String(log.length);
}

function renderPanels(): void {
  const warnings = [
    ...(loaded?.warnings ?? []).map((op) => `Unsupported block ${op}: Bytecat skips it, so scripts that use it may behave differently.`),
    ...assetErrors.map((name) => `Costume image ${name} could not be decoded and will not be drawn.`),
  ];
  $("warnings").replaceChildren(...warnings.map((w) => Object.assign(document.createElement("li"), { textContent: w })));
  $("warnings-empty").hidden = warnings.length > 0;
  const count = $("warning-count");
  count.hidden = warnings.length === 0;
  count.textContent = String(warnings.length);
  $("js").textContent = loaded ? toModule(loaded.code) : "";
  renderOutput(true);
}

for (const tab of document.querySelectorAll<HTMLButtonElement>("[role=tab]")) {
  tab.addEventListener("click", () => {
    for (const t of document.querySelectorAll<HTMLButtonElement>("[role=tab]")) {
      const selected = t === tab;
      t.setAttribute("aria-selected", String(selected));
      $(`panel-${t.dataset.tab}`).hidden = !selected;
    }
  });
}

$("copy-js").addEventListener("click", () => {
  void navigator.clipboard?.writeText($("js").textContent ?? "").then(() => {
    $("copy-js").textContent = "Copied";
    setTimeout(() => ($("copy-js").textContent = "Copy"), 1200);
  });
});

// ---- downloads ----

function save(filename: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function download(kind: string): void {
  if (mode === "editor" && !compileEditor()) return;
  if (!loaded) return;
  const { name, project, code } = loaded;
  if (kind === "html") save(`${name}.html`, pageHtml(project, code, __PLAYER_SCRIPT__, name), "text/html");
  else if (kind === "sb3") save(`${name}.sb3`, (loaded.sb3 ?? writeSb3(project)) as BlobPart, "application/x.scratch.sb3");
  else if (kind === "js") save(`${name}.js`, toModule(code), "text/javascript");
}

function toggleMenu(open = downloadMenu.hidden): void {
  downloadMenu.hidden = !open;
  $("download").setAttribute("aria-expanded", String(open));
}

$("download").addEventListener("click", (e) => {
  e.stopPropagation();
  toggleMenu();
});
downloadMenu.addEventListener("click", (e) => {
  const kind = (e.target as HTMLElement).closest<HTMLElement>("[data-download]")?.dataset.download;
  if (kind) download(kind);
  toggleMenu(false);
});
document.addEventListener("click", () => toggleMenu(false));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") toggleMenu(false);
});

// ---- opening files and samples ----

$("open").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void openFile(file);
  fileInput.value = "";
});
$("back-to-editor").addEventListener("click", () => {
  player?.dispose();
  player = null;
  loaded = null;
  showEditor();
  setStatus("Press Run to compile and start");
});

const drop = $("drop");
let dragDepth = 0;
window.addEventListener("dragenter", (e) => {
  if (!e.dataTransfer?.types.includes("Files")) return;
  dragDepth++;
  drop.hidden = false;
});
window.addEventListener("dragleave", () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    drop.hidden = true;
  }
});
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => {
  e.preventDefault();
  dragDepth = 0;
  drop.hidden = true;
  const file = e.dataTransfer?.files[0];
  if (file) void openFile(file);
});

samples.append(
  Object.assign(document.createElement("option"), { value: "", textContent: "Samples…", disabled: true }),
  ...__SAMPLES__.map((s) => Object.assign(document.createElement("option"), { value: s.name, textContent: s.name })),
);
samples.addEventListener("change", () => {
  const sample = __SAMPLES__.find((s) => s.name === samples.value);
  samples.value = "";
  if (!sample) return;
  setSource(sample.name, sample.source);
  if (compileEditor()) void startPlayer().then(updateStatus);
});

$("flag").addEventListener("click", () => void run());
$("stop").addEventListener("click", stop);

// The frame loop belongs to the player; this only refreshes the output and status a few times a second.
setInterval(() => {
  renderOutput();
  updateStatus();
}, 150);

window.bytecatApp = {
  get player() {
    return player;
  },
  get loaded() {
    return loaded;
  },
  run,
  openFile,
};

async function init(): Promise<void> {
  const initial = readDraft() ?? __SAMPLES__[0] ?? { name: "untitled", source: "" };
  setSource(initial.name, initial.source);
  samples.value = "";
  if (compileEditor()) await startPlayer();
  updateStatus();
  if (!loaded) setStatus("Press Run to compile and start");
  document.body.dataset.ready = "true";
}

void init();
