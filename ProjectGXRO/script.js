const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const searchInput = document.getElementById("searchInput");
const clearButton = document.getElementById("clearButton");
const library = document.getElementById("library");
const detailsPanel = document.getElementById("detailsPanel");
const audioPlayer = document.getElementById("audioPlayer");
const nowPlaying = document.getElementById("nowPlaying");
const trackCount = document.getElementById("trackCount");
const totalSize = document.getElementById("totalSize");
const saveStatus = document.getElementById("saveStatus");
const appShell = document.getElementById("appShell");
const passwordScreen = document.getElementById("passwordScreen");
const passwordForm = document.getElementById("passwordForm");
const passwordInput = document.getElementById("passwordInput");
const passwordError = document.getElementById("passwordError");
const tabButtons = document.querySelectorAll("[data-tab]");
const tabPanels = document.querySelectorAll("[data-panel]");

const DB_NAME = "ProjectGXROStorage";
const DB_VERSION = 1;
const TRACK_STORE = "tracks";
const GXRO_PASSWORD = "december";
const PUBLIC_TRACKS_URL = "public-tracks.json";
const R2_TRACKS_URL = "/api/gxro/tracks";
const pageParams = new URLSearchParams(window.location.search);
const forcePasswordScreen = pageParams.get("lock") === "1";

if (forcePasswordScreen) {
  sessionStorage.removeItem("projectGXROUnlocked");
}

let tracks = [];
let activeTrackId = null;
let playingTrackId = null;
let saveTimer = null;
let dbPromise = null;
let gxroUnlocked = !forcePasswordScreen && sessionStorage.getItem("projectGXROUnlocked") === "true";

function cleanName(fileName) {
  return fileName.replace(/\.mp3$/i, "");
}

function formatSize(bytes) {
  if (!bytes) return "0 MB";
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getTrackFileName(track) {
  if (track.file && track.file.name) return track.file.name;
  if (track.url) return track.url.split("/").pop();
  return "Public MP3";
}

function addFiles(fileList) {
  const mp3Files = Array.from(fileList).filter((file) => {
    return file.type === "audio/mpeg" || file.name.toLowerCase().endsWith(".mp3");
  });

  const newTracks = mp3Files.map((file) => ({
    id: createTrackId(file),
    file,
    name: cleanName(file.name),
    artist: "",
    album: "",
    summary: "",
    lyrics: "",
    coverFile: null,
    coverUrl: "",
    coverName: "",
    size: file.size,
    url: URL.createObjectURL(file),
    isPublic: false
  }));

  tracks = [...tracks, ...newTracks].sort((a, b) => a.name.localeCompare(b.name));
  if (!activeTrackId && newTracks.length) {
    activeTrackId = newTracks[0].id;
    audioPlayer.src = newTracks[0].url;
    nowPlaying.textContent = `Selected: ${newTracks[0].name}`;
  }

  if (newTracks.length) {
    switchTab("add");
  }

  render();
  scheduleSave();
}

async function loadPublicTracks() {
  const publicTrackSources = [];

  for (const url of [R2_TRACKS_URL, PUBLIC_TRACKS_URL]) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`No public tracks found at ${url}.`);

      const publicTracks = await response.json();
      if (Array.isArray(publicTracks)) publicTrackSources.push(...publicTracks);
    } catch (error) {
      console.info(error.message);
    }
  }

  const seenTracks = new Set();
  const normalizedPublicTracks = publicTrackSources
    .filter((track, index) => {
      const key = track.id || track.url || `track-${index}`;
      if (seenTracks.has(key)) return false;
      seenTracks.add(key);
      return true;
    })
    .map((track, index) => ({
      id: `public-${track.id || index}`,
      file: null,
      name: track.name || "Untitled Public Track",
      artist: track.artist || "",
      album: track.album || "",
      summary: track.summary || "",
      lyrics: track.lyrics || "",
      coverFile: null,
      coverUrl: track.coverUrl || "",
      coverName: "",
      size: 0,
      url: track.url,
      isPublic: true
    }));

  tracks = [
    ...tracks.filter((track) => !track.isPublic),
    ...normalizedPublicTracks
  ];

  if (!activeTrackId && tracks.length) {
    activeTrackId = tracks[0].id;
    audioPlayer.src = tracks[0].url;
    nowPlaying.textContent = `Selected: ${tracks[0].name}`;
  }

  render();
}

function openDatabase() {
  if (!("indexedDB" in window)) {
    setSaveStatus("Storage is not supported in this browser.");
    return Promise.reject(new Error("IndexedDB is not supported."));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TRACK_STORE)) {
        db.createObjectStore(TRACK_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

async function loadSavedTracks() {
  try {
    const db = await openDatabase();
    const savedTracks = await readAllTracks(db);

    tracks.forEach((track) => {
      URL.revokeObjectURL(track.url);
      if (track.coverUrl) URL.revokeObjectURL(track.coverUrl);
    });

    const localTracks = savedTracks.map((track) => ({
      ...track,
      url: URL.createObjectURL(track.file),
      coverUrl: track.coverFile ? URL.createObjectURL(track.coverFile) : "",
      isPublic: false
    }));

    tracks = [
      ...tracks.filter((track) => track.isPublic),
      ...localTracks
    ];

    activeTrackId = tracks[0]?.id || null;
    if (activeTrackId) {
      const firstTrack = tracks.find((track) => track.id === activeTrackId);
      audioPlayer.src = firstTrack.url;
      nowPlaying.textContent = `Selected: ${firstTrack.name}`;
    }

    render();
    setSaveStatus(tracks.length ? "Saved library loaded in this browser." : "Saved songs will load again in this browser.");
  } catch (error) {
    console.error(error);
    setSaveStatus("Could not load saved songs in this browser.");
  }
}

function readAllTracks(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(TRACK_STORE, "readonly");
    const store = transaction.objectStore(TRACK_STORE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function scheduleSave() {
  clearTimeout(saveTimer);
  setSaveStatus("Saving library...");
  saveTimer = setTimeout(() => {
    saveLibrary();
  }, 300);
}

async function saveLibrary() {
  try {
    const db = await openDatabase();

    await new Promise((resolve, reject) => {
      const transaction = db.transaction(TRACK_STORE, "readwrite");
      const store = transaction.objectStore(TRACK_STORE);

      store.clear();
      tracks.filter((track) => !track.isPublic).forEach((track) => {
        store.put({
          id: track.id,
          file: track.file,
          name: track.name,
          artist: track.artist,
          album: track.album,
          summary: track.summary,
          lyrics: track.lyrics,
          coverFile: track.coverFile,
          coverName: track.coverName,
          size: track.size
        });
      });

      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });

    setSaveStatus("Library saved in this browser.");
  } catch (error) {
    console.error(error);
    setSaveStatus("Save failed. Your browser may not allow enough storage.");
  }
}

function createTrackId(file) {
  if (globalThis.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function selectTrack(trackId) {
  const track = tracks.find((item) => item.id === trackId);
  if (!track) return;

  activeTrackId = track.id;
  audioPlayer.src = track.url;
  nowPlaying.textContent = `Selected: ${track.name}`;
  render();
}

function openTrackDetails(trackId) {
  selectTrack(trackId);
  switchTab("add");
}

function playTrack(trackId) {
  const track = tracks.find((item) => item.id === trackId);
  if (!track) return;

  activeTrackId = track.id;
  audioPlayer.src = track.url;
  nowPlaying.textContent = `Now playing: ${track.name}`;
  audioPlayer.play()
    .then(() => {
      playingTrackId = track.id;
      render(false);
    })
    .catch(() => {
      playingTrackId = null;
      render(false);
    });
  render();
}

function clearLibrary() {
  const firstConfirm = confirm("Are you sure you want to delete your locally saved ProjectGXRO library?");
  if (!firstConfirm) return;

  const secondConfirm = confirm("This will remove every locally saved MP3, cover image, and song detail from this browser. Public website tracks will stay online. Delete local songs?");
  if (!secondConfirm) return;

  tracks.filter((track) => !track.isPublic).forEach((track) => {
    URL.revokeObjectURL(track.url);
    if (track.coverUrl) URL.revokeObjectURL(track.coverUrl);
  });

  tracks = tracks.filter((track) => track.isPublic);
  activeTrackId = tracks[0]?.id || null;
  playingTrackId = null;
  if (activeTrackId) {
    const firstTrack = tracks.find((track) => track.id === activeTrackId);
    audioPlayer.src = firstTrack.url;
    nowPlaying.textContent = `Selected: ${firstTrack.name}`;
  } else {
    audioPlayer.removeAttribute("src");
    audioPlayer.load();
    nowPlaying.textContent = "No track selected";
  }
  searchInput.value = "";
  render();
  scheduleSave();
}

function render(includeDetails = true) {
  const query = searchInput.value.trim().toLowerCase();
  tracks.sort((a, b) => a.name.localeCompare(b.name));

  const visibleTracks = tracks.filter((track) => {
    return [
      track.name,
      track.artist,
      track.album,
      getTrackFileName(track)
    ].some((value) => value.toLowerCase().includes(query));
  });
  const bytes = tracks.filter((track) => !track.isPublic).reduce((sum, track) => sum + track.size, 0);

  trackCount.textContent = tracks.length;
  totalSize.textContent = formatSize(bytes);
  if (includeDetails) renderDetails();

  if (!tracks.length) {
    library.innerHTML = `
      <div class="empty">
        <div>
          <strong>Your MP3 names will show here</strong>
          Add files from the Add MP3 tab.
        </div>
      </div>
    `;
    return;
  }

  if (!visibleTracks.length) {
    library.innerHTML = `
      <div class="empty">
        <div>
          <strong>No matching MP3 names</strong>
          Try a different search.
        </div>
      </div>
    `;
    return;
  }

  library.innerHTML = visibleTracks.map((track) => `
    <article class="song ${track.id === activeTrackId ? "active" : ""}" data-track-id="${track.id}" tabindex="0">
      <div class="song-cover-thumb">
        ${track.coverUrl ? `<img src="${track.coverUrl}" alt="${escapeHtml(track.name)} cover image">` : "♪"}
      </div>
      <button class="play-button" type="button" data-play-track-id="${track.id}" aria-label="Play ${escapeAttribute(track.name)}">
        ${track.id === playingTrackId ? "II" : ">"}
      </button>
      <div>
        <div class="song-name">${escapeHtml(track.name)}</div>
        <div class="song-meta">${escapeHtml(track.artist || "Unknown artist")} - ${escapeHtml(track.album || getTrackFileName(track))} - ${track.isPublic ? "Public track" : formatSize(track.size)}</div>
      </div>
      <span class="song-index">#${tracks.indexOf(track) + 1}</span>
    </article>
  `).join("");
}

function renderDetails() {
  const track = tracks.find((item) => item.id === activeTrackId);

  if (!track) {
    detailsPanel.innerHTML = `
      <div class="details-empty">
        <div>
          <strong>Select a song to edit details</strong>
          Rename it, add artist and album info, write a synopsis, add lyrics, and attach cover art.
        </div>
      </div>
    `;
    return;
  }

  detailsPanel.innerHTML = `
    <div class="details-grid">
      <div class="cover-box">
        <div class="cover-preview">
          ${track.coverUrl ? `<img src="${track.coverUrl}" alt="${escapeHtml(track.name)} cover image">` : "No cover image"}
        </div>
        <label class="form-row">
          <span>Cover image</span>
          <input class="cover-input" id="coverInput" type="file" accept="image/*" ${track.isPublic ? "disabled" : ""}>
        </label>
        ${track.isPublic ? `<p class="public-note">This is a public website track. Edit it in public-tracks.json.</p>` : ""}
      </div>

      <div class="details-form">
        <h2 class="details-title">${escapeHtml(track.name)}</h2>

        <div class="form-row">
          <label for="songName">Song name</label>
          <input class="text-field" id="songName" data-field="name" type="text" value="${escapeAttribute(track.name)}" ${track.isPublic ? "disabled" : ""}>
        </div>

        <div class="form-row">
          <label for="songArtist">Artist</label>
          <input class="text-field" id="songArtist" data-field="artist" type="text" value="${escapeAttribute(track.artist)}" ${track.isPublic ? "disabled" : ""}>
        </div>

        <div class="form-row">
          <label for="songAlbum">Album</label>
          <input class="text-field" id="songAlbum" data-field="album" type="text" value="${escapeAttribute(track.album)}" ${track.isPublic ? "disabled" : ""}>
        </div>

        <div class="form-row">
          <label for="songSummary">Synopsis</label>
          <textarea class="text-area" id="songSummary" data-field="summary" ${track.isPublic ? "disabled" : ""}>${escapeHtml(track.summary)}</textarea>
        </div>

        <div class="form-row">
          <label for="songLyrics">Lyrics</label>
          <textarea class="text-area lyrics-area" id="songLyrics" data-field="lyrics" ${track.isPublic ? "disabled" : ""}>${escapeHtml(track.lyrics)}</textarea>
        </div>
        ${track.isPublic ? "" : `
          <button class="button publish-button" type="button" data-publish-track>Publish to website</button>
          <p class="public-note" id="publishStatus">This sends the MP3 and song details to Cloudflare R2 for everyone who opens Project GXRO.</p>
        `}
      </div>
    </div>
  `;
}

function switchTab(tabName) {
  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });

  tabPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === tabName);
  });
}

function unlockProjectGXRO() {
  gxroUnlocked = true;
  sessionStorage.setItem("projectGXROUnlocked", "true");
  passwordScreen.classList.add("unlocked");
  appShell.classList.remove("locked");
  if (forcePasswordScreen) {
    history.replaceState(null, "", window.location.pathname);
  }
  switchTab("gxro-home");
}

function updateActiveTrack(field, value) {
  const track = tracks.find((item) => item.id === activeTrackId);
  if (!track) return;
  if (track.isPublic) return;

  track[field] = field === "name" ? value.trim() || cleanName(track.file.name) : value;

  if (field === "name") {
    nowPlaying.textContent = playingTrackId === track.id ? `Now playing: ${track.name}` : `Selected: ${track.name}`;
    const title = detailsPanel.querySelector(".details-title");
    if (title) title.textContent = track.name;
  }

  render(false);
  scheduleSave();
}

function updateCover(file) {
  const track = tracks.find((item) => item.id === activeTrackId);
  if (!track || !file) return;
  if (track.isPublic) return;

  if (track.coverUrl) URL.revokeObjectURL(track.coverUrl);
  track.coverFile = file;
  track.coverUrl = URL.createObjectURL(file);
  track.coverName = file.name;
  render();
  scheduleSave();
}

function setPublishStatus(message, isError = false) {
  const publishStatus = document.getElementById("publishStatus");
  if (!publishStatus) return;

  publishStatus.textContent = message;
  publishStatus.classList.toggle("error", isError);
}

async function publishActiveTrack() {
  const track = tracks.find((item) => item.id === activeTrackId);
  if (!track || track.isPublic) return;

  const confirmed = confirm(`Publish "${track.name}" to Project GXRO so everyone can see it?`);
  if (!confirmed) return;

  setPublishStatus("Publishing to R2...");

  try {
    const formData = new FormData();
    formData.append("password", GXRO_PASSWORD);
    formData.append("name", track.name);
    formData.append("artist", track.artist);
    formData.append("album", track.album);
    formData.append("summary", track.summary);
    formData.append("lyrics", track.lyrics);
    formData.append("mp3", track.file, track.file.name);
    if (track.coverFile) formData.append("cover", track.coverFile, track.coverFile.name);

    const response = await fetch(R2_TRACKS_URL, {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "R2 upload failed.");
    }

    await loadPublicTracks();
    setPublishStatus("Published. The track is now loaded from the website library.");
  } catch (error) {
    console.error(error);
    setPublishStatus(`${error.message} Make sure Cloudflare Pages has the PROJECT_GXRO_BUCKET R2 binding.`, true);
  }
}

function setSaveStatus(message) {
  if (saveStatus) saveStatus.textContent = message;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    }[character];
  });
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

fileInput.addEventListener("change", (event) => {
  addFiles(event.target.files);
  fileInput.value = "";
});

searchInput.addEventListener("input", render);
clearButton.addEventListener("click", clearLibrary);

if (gxroUnlocked) {
  unlockProjectGXRO();
}

passwordForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (passwordInput.value.trim() === GXRO_PASSWORD) {
    passwordError.textContent = "";
    unlockProjectGXRO();
    return;
  }

  passwordError.textContent = "Incorrect password. Try again.";
  passwordInput.select();
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    switchTab(button.dataset.tab);
  });
});

library.addEventListener("click", (event) => {
  const playButton = event.target.closest("[data-play-track-id]");
  if (playButton) {
    playTrack(playButton.dataset.playTrackId);
    return;
  }

  const song = event.target.closest(".song");
  if (song) openTrackDetails(song.dataset.trackId);
});

library.addEventListener("keydown", (event) => {
  const song = event.target.closest(".song");
  if (!song) return;

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openTrackDetails(song.dataset.trackId);
  }
});

detailsPanel.addEventListener("input", (event) => {
  const field = event.target.dataset.field;
  if (field) updateActiveTrack(field, event.target.value);
});

detailsPanel.addEventListener("change", (event) => {
  if (event.target.id === "coverInput") {
    updateCover(event.target.files[0]);
  }
});

detailsPanel.addEventListener("click", (event) => {
  if (event.target.closest("[data-publish-track]")) {
    publishActiveTrack();
  }
});

audioPlayer.addEventListener("pause", () => {
  playingTrackId = null;
  render(false);
});

audioPlayer.addEventListener("ended", () => {
  playingTrackId = null;
  render(false);
});

audioPlayer.addEventListener("play", () => {
  playingTrackId = activeTrackId;
  render(false);
});

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  });
});

dropZone.addEventListener("drop", (event) => {
  addFiles(event.dataTransfer.files);
});

loadSavedTracks();
loadPublicTracks();

const requestedTab = new URLSearchParams(window.location.search).get("tab");
if (requestedTab && gxroUnlocked) {
  switchTab(requestedTab);
}
