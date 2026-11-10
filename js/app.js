
'use strict';

(() => {
  const $ = id => document.getElementById(id);

  let completed = new Set();
  let previewKey = null;
  let resumeData = null;

  const PREVIEW_STORAGE = 'fivem-map-preview-v1';

  function loadPreview() {
    try {
      const data = JSON.parse(localStorage.getItem(PREVIEW_STORAGE) || 'null');
      if (!data || !Array.isArray(data.checkpoints) ||
        !Array.isArray(data.completed) || typeof data.title !== 'string') {
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }

  function savePreview() {
    if (mode !== 'upload' || !previewKey) return;

    try {
      localStorage.setItem(PREVIEW_STORAGE, JSON.stringify({
        title: $('mapTitle').value,
        checkpoints: Checkpoints.list(),
        completed: [...completed],
        key: previewKey
      }));
    } catch {
      toast('Unable to save progress in this browser.');
    }
  }

  function previewSignature(data) {
    const raw = JSON.stringify([data.title, data.checkpoints]);
    let h = 2166136261;

    for (let i = 0; i < raw.length; i++) {
      h ^= raw.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }

    return String(h >>> 0);
  }

  function setCompleted(id, checked) {
    if (mode !== 'upload') return;

    if (checked) completed.add(id);
    else completed.delete(id);

    savePreview();
    render();
  }

  let mode = 'create';
  let locked = false;
  let editing = null;
  let pending = null;
  let selected = null;
  let mapStarted = false;
  let confirmAction = null;
  let menuPointId = null;

  const DRAFT_STORAGE = 'fivem-map-create-draft-v1';
  let draftResume = null;
  let suspendDraft = false;

  // Snapshot updated only when checkpoints change.
  let autosavePoints = Checkpoints.list();

  function loadDraft() {
    try {
      const data = JSON.parse(localStorage.getItem(DRAFT_STORAGE) || 'null');

      if (!data || typeof data.title !== 'string' ||
        !Array.isArray(data.checkpoints) || data.checkpoints.length > 500) {
        return null;
      }

      if (data.checkpoints.some(p =>
        !Number.isSafeInteger(p.id) ||
        typeof p.name !== 'string' ||
        typeof p.x !== 'number' ||
        typeof p.y !== 'number' ||
        p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1
      )) {
        return null;
      }

      return data;
    } catch {
      return null;
    }
  }

  function saveDraft() {
    if (suspendDraft || mode !== 'create') return;

    try {
      localStorage.setItem(DRAFT_STORAGE, JSON.stringify({
        title: $('mapTitle').value,
        checkpoints: autosavePoints,
        savedAt: Date.now()
      }));

      $('draftStatus').textContent = '● Autosaved locally';
    } catch {
      $('draftStatus').textContent = '⚠ Autosave unavailable';
      toast('Local autosave failed. Export your TXT as a backup.');
    }
  }

  Checkpoints.subscribe(() => {
    autosavePoints = Checkpoints.list();
    saveDraft();
  });

  $('mapTitle').addEventListener('input', saveDraft);

  function beginCreate(data) {
    suspendDraft = true;
    Checkpoints.replace(data?.checkpoints || []);
    $('mapTitle').value = data?.title || 'Untitled Map';
    suspendDraft = false;

    start('create');
    saveDraft();
  }

  const palettes = [
    '#ff5252', '#4d9aff', '#43d68a',
    '#ffcc47', '#b47cff', '#ffffff', '#ff8d43'
  ];

  const COLOR_STORAGE = 'fivem-map-last-checkpoint-color';
  let lastPointColor = '#ff5252';

  try {
    const stored = localStorage.getItem(COLOR_STORAGE);
    if (palettes.includes(stored)) lastPointColor = stored;
  } catch { }

  function rememberPointColor(color) {
    if (!palettes.includes(color)) return;

    lastPointColor = color;

    try {
      localStorage.setItem(COLOR_STORAGE, color);
    } catch { }
  }

  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.style.display = 'block';

    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.style.display = 'none', 3500);
  }

  function ask(title, message, action) {
    confirmAction = action;
    $('confirmHeading').textContent = title;
    $('confirmMessage').textContent = message;
    $('confirmDialog').showModal();
  }

  $('confirmCancel').onclick = () => $('confirmDialog').close();

  $('confirmYes').onclick = () => {
    const action = confirmAction;
    confirmAction = null;
    menuPointId = null;

    $('confirmDialog').close();
    action?.();
  };

  function start(nextMode) {
    mode = nextMode;
    locked = mode !== 'create';

    $('home').classList.add('hidden');
    $('workspace').classList.remove('hidden');
    $('mapTitle').disabled = mode !== 'create';

    $('editMapBtn').classList.toggle('hidden', mode !== 'upload');
    $('exportBtn').classList.toggle('hidden', mode !== 'create');
    $('lockBtn').classList.toggle('hidden', mode !== 'create');
    $('clearBtn').classList.toggle('hidden', mode !== 'create');
    $('undoBtn').classList.toggle('hidden', mode !== 'create');

    $('search').value = '';
    $('draftStatus').classList.toggle('hidden', mode !== 'create');
    $('progressCount').classList.toggle('hidden', mode !== 'upload');

    if (!mapStarted) {
      MapView.init(onMapClick);
      mapStarted = true;
    }

    setTimeout(() => {
      MapView.fit();
      render();
    }, 60);

    updateLock();
  }

  function updateLock() {
    if (mode !== 'create') {
      $('mapHint').textContent = mode === 'upload'
        ? 'Uploaded map • Read-only • Click Edit Map to make changes'
        : 'Preview only • Explore the map';
      return;
    }

    $('lockBtn').textContent = locked ? '🔒 Unlock Map' : '🔓 Lock Mode';
    $('mapHint').textContent = locked
      ? 'Lock Mode • Checkpoints are read-only'
      : 'Click anywhere on the map to add a checkpoint';
  }

  function onMapClick(latlng) {
    if (mode !== 'create' || locked) return;

    const coords = MapView.normalize(latlng);

    if (!MapView.inBounds(coords)) {
      toast('Click inside the map image.');
      return;
    }

    if (Checkpoints.list().length >= 500) {
      toast('Maximum 500 checkpoints reached.');
      return;
    }

    pending = coords;
    editing = null;
    openDialog();
  }

  function openDialog(id) {
    const p = id == null
      ? null
      : Checkpoints.list().find(p => p.id === id);

    if (id != null && !p) return;
    if (mode !== 'create' || locked) return;

    editing = p?.id ?? null;
    pending = p ? { x: p.x, y: p.y } : pending;

    $('dialogHeading').textContent = p ? 'Edit checkpoint' : 'Add checkpoint?';
    $('dialogSub').textContent = p
      ? 'Update this checkpoint’s details.'
      : 'Are you sure you want to place a checkpoint here?';

    $('pointName').value = p?.name ?? Checkpoints.nextName();
    $('pointDescription').value = p?.description ?? '';
    $('pointColor').value = p?.color ?? lastPointColor;
    $('deletePoint').classList.toggle('hidden', !p);
    $('savePoint').textContent = p ? 'Save Changes' : 'Confirm Location';

    $('pointDialog').showModal();
    $('pointName').focus();
  }

  $('cancelPoint').onclick = () => $('pointDialog').close();

  $('pointForm').addEventListener('submit', e => {
    e.preventDefault();

    const data = {
      name: $('pointName').value.trim(),
      description: $('pointDescription').value.trim(),
      color: $('pointColor').value
    };

    if (!data.name) return;

    rememberPointColor(data.color);

    if (editing != null) {
      Checkpoints.update(editing, data);
    } else {
      if (!pending) return;
      Checkpoints.add({ ...data, ...pending });
    }

    $('pointDialog').close();
    render();

    toast(editing != null ? 'Checkpoint updated.' : 'Checkpoint added.');
  });

  $('deletePoint').onclick = () => {
    const id = editing;
    $('pointDialog').close();

    ask(
      'Delete checkpoint?',
      'This checkpoint will be removed from the map.',
      () => {
        Checkpoints.remove(id);
        render();
        toast('Checkpoint deleted.');
      }
    );
  };

  // Full update: map markers, counters and sidebar.
  function render() {
    const points = Checkpoints.list();

    MapView.render(
      points,
      id => {
        const p = points.find(p => p.id === id);

        if (p) {
          MapView.showPopup(
            p,
            mode === 'create' && !locked,
            openDialog
          );
        }
      },
      mode === 'upload' ? completed : new Set()
    );

    $('count').textContent = `${points.length} / 500`;
    $('progressCount').textContent =
      `${completed.size} / ${points.length} found`;
    $('undoBtn').disabled = !Checkpoints.canUndo();

    renderList(points);
  }

  // Search updates only the sidebar, not the map.

  // Cache for checkpoint rows, keyed by checkpoint ID.
  const pointRows = new Map();

  function createPointRow(p) {
    const btn = document.createElement('button');
    btn.className = 'point-item';

    const dot = document.createElement('span');
    dot.className = 'dot';

    const info = document.createElement('span');
    info.className = 'point-info';

    const strong = document.createElement('strong');
    const small = document.createElement('small');

    info.append(strong, small);

    const row = {
      btn,
      dot,
      strong,
      small,
      check: null,
      point: p,
      mode
    };

    if (mode === 'upload') {
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.className = 'point-check';

      check.addEventListener('click', e => {
        e.stopPropagation();
      });

      check.addEventListener('change', e => {
        setCompleted(row.point.id, e.target.checked);
      });

      row.check = check;
      btn.append(check);
    }

    btn.append(dot, info);

    btn.addEventListener('contextmenu', e => {
      e.preventDefault();

      if (mode !== 'create' || locked) return;

      menuPointId = row.point.id;

      const menu = $('checkpointMenu');
      menu.classList.remove('hidden');

      menu.style.left =
        Math.min(e.clientX, innerWidth - 170) + 'px';

      menu.style.top =
        Math.min(e.clientY, innerHeight - 105) + 'px';
    });

    btn.onclick = () => {
      hidePointMenu();

      const current = row.point;

      MapView.focus(current, () => {
        MapView.showPopup(
          current,
          mode === 'create' && !locked,
          openDialog,
          true
        );
      });
    };

    return row;
  }

  function updatePointRow(row, p) {
    row.point = p;

    if (row.strong.textContent !== p.name) {
      row.strong.textContent = p.name;
    }

    const description = p.description || `#${p.id}`;

    if (row.small.textContent !== description) {
      row.small.textContent = description;
    }

    if (row.dot.style.backgroundColor !== p.color) {
      row.dot.style.backgroundColor = p.color;
    }

    if (row.check) {
      const found = completed.has(p.id);

      if (row.check.checked !== found) {
        row.check.checked = found;
      }

      row.check.setAttribute(
        'aria-label',
        `Mark ${p.name} as found`
      );

      row.btn.classList.toggle('found', found);
    }
  }

  // Update only the sidebar. Reuse existing checkpoint rows.
  function renderList(points) {
    const query = $('search').value.trim().toLowerCase();
    const list = $('pointList');

    const activeIds = new Set(points.map(p => p.id));

    // Remove cached rows for deleted checkpoints.
    for (const [id] of pointRows) {
      if (!activeIds.has(id)) {
        pointRows.delete(id);
      }
    }

    const filtered = points.filter(p =>
      p.name.toLowerCase().includes(query) ||
      p.description.toLowerCase().includes(query)
    );

    if (!filtered.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';

      empty.textContent = points.length
        ? 'No matching checkpoints.'
        : 'No checkpoints yet. Click the map to add one.';

      list.replaceChildren(empty);
      return;
    }

    let cursor = list.firstChild;

    for (const p of filtered) {
      let row = pointRows.get(p.id);

      // Different modes need different row structures.
      if (!row || row.mode !== mode) {
        row = createPointRow(p);
        pointRows.set(p.id, row);
      }

      updatePointRow(row, p);

      // Keep the correct order without rebuilding rows.
      if (row.btn === cursor) {
        cursor = cursor.nextSibling;
      } else {
        list.insertBefore(row.btn, cursor);
      }
    }

    // Remove rows that are no longer visible.
    while (cursor) {
      const next = cursor.nextSibling;
      cursor.remove();
      cursor = next;
    }
  }


  function hidePointMenu() {
    $('checkpointMenu').classList.add('hidden');
  }

  document.addEventListener('contextmenu', e => {
    e.preventDefault();
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#checkpointMenu')) {
      hidePointMenu();
    }
  });

  window.addEventListener('scroll', hidePointMenu, true);

  $('menuEdit').onclick = () => {
    const id = menuPointId;
    hidePointMenu();
    openDialog(id);
  };

  $('menuDelete').onclick = () => {
    const id = menuPointId;
    hidePointMenu();

    if (mode !== 'create' || locked) return;

    ask(
      'Delete checkpoint?',
      'This checkpoint will be removed from the map.',
      () => {
        Checkpoints.remove(id);
        render();
        toast('Checkpoint deleted.');
      }
    );
  };

  $('hideSidebar').onclick = () => {
    $('sidebar').classList.add('collapsed');
    $('showSidebar').classList.remove('hidden');
  };

  $('showSidebar').onclick = () => {
    $('sidebar').classList.remove('collapsed');
    $('showSidebar').classList.add('hidden');
  };

  const backgroundOptions = [
    ...document.querySelectorAll('.bg-option')
  ];

  const backgroundColors = [
    '#080a0b', '#f1f4f5', '#334550', '#777f84'
  ];

  function applyBackground(value) {
    if (!backgroundColors.includes(value)) {
      value = '#334550';
    }

    document.documentElement.style.setProperty(
      '--map-background',
      value
    );

    backgroundOptions.forEach(button => {
      const active = button.dataset.color === value;

      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });

    try {
      localStorage.setItem('fivem-map-background', value);
    } catch { }
  }

  let savedBackground = '#334550';

  try {
    savedBackground =
      localStorage.getItem('fivem-map-background') || savedBackground;
  } catch { }

  applyBackground(savedBackground);

  backgroundOptions.forEach(button =>
    button.addEventListener('click', () =>
      applyBackground(button.dataset.color)
    )
  );

  $('editMapBtn').onclick = () => {
    if (mode !== 'upload') return;

    completed = new Set();
    start('create');
    saveDraft();

    toast('Editing enabled. Imported checkpoints preserved and autosaved.');
  };

  // Only rebuild the sidebar while typing in search.
  $('search').addEventListener('input', () => {
    renderList(Checkpoints.list());
  });

  $('fitBtn').onclick = () => MapView.fit();

  $('lockBtn').onclick = () => {
    locked = !locked;
    updateLock();
    render();
  };

  $('undoBtn').onclick = () => {
    if (Checkpoints.undo()) {
      render();
      toast('Last change undone.');
    }
  };

  $('clearBtn').onclick = () => {
    if (!Checkpoints.list().length) return;

    ask(
      'Clear all checkpoints?',
      'This will remove every checkpoint. You can undo this action.',
      () => {
        Checkpoints.clear();
        render();
        toast('All checkpoints cleared.');
      }
    );
  };

  $('exportBtn').onclick = () => {
    if (mode !== 'create') return;

    $('exportFilename').value =
      ($('mapTitle').value.trim() || 'fivem-map')
        .replace(/[\\/:*?"<>|\x00-\x1f]/g, '')
        .slice(0, 70);

    $('exportDialog').showModal();
    $('exportFilename').focus();
    $('exportFilename').select();
  };

  $('exportCancel').onclick = () => $('exportDialog').close();

  $('exportForm').onsubmit = e => {
    e.preventDefault();

    const name = $('exportFilename').value.trim();
    if (!name) return;

    MapFiles.download(
      $('mapTitle').value.trim() || 'Untitled Map',
      'default',
      Checkpoints.list(),
      name
    );

    $('exportDialog').close();
    toast('Map file downloaded.');
  };

  function openUploaded(data) {
    suspendDraft = true;
    Checkpoints.replace(data.checkpoints);
    suspendDraft = false;

    $('mapTitle').value = data.title;
    completed = new Set(data.completed || []);
    previewKey = data.key || previewSignature(data);

    start('upload');
    savePreview();

    toast(`Loaded ${data.checkpoints.length} checkpoints.`);
  }

  $('resumeNo').onclick = () => {
    $('resumeDialog').close();
    $('fileInput').click();
  };

  $('resumeYes').onclick = () => {
    $('resumeDialog').close();
    if (resumeData) openUploaded(resumeData);
  };

  $('previewBtn').onclick = () => {
    suspendDraft = true;
    Checkpoints.replace([]);
    suspendDraft = false;

    $('mapTitle').value = 'Preview Map';
    start('preview');
  };

  $('createBtn').onclick = () => {
    draftResume = loadDraft();

    if (draftResume) {
      $('draftResumeTitle').textContent =
        draftResume.title || 'Untitled Map';

      $('draftResumeCount').textContent =
        `${draftResume.checkpoints.length} checkpoints saved`;

      $('draftResumeDialog').showModal();
    } else {
      beginCreate();
    }
  };

  $('draftResumeYes').onclick = () => {
    $('draftResumeDialog').close();
    beginCreate(draftResume);
    toast('Draft restored from this browser.');
  };

  $('draftResumeNo').onclick = () => {
    $('draftResumeDialog').close();

    ask(
      'Start a new map?',
      'This replaces the locally saved draft. Export the old map first if you need it.',
      () => beginCreate()
    );
  };

  $('draftResumeCancel').onclick = () =>
    $('draftResumeDialog').close();

  $('uploadBtn').onclick = () => {
    resumeData = loadPreview();

    if (resumeData) {
      $('resumeTitle').textContent = resumeData.title;
      $('resumeProgress').textContent =
        `${resumeData.completed.length} / ${resumeData.checkpoints.length} checkpoints found`;

      $('resumeDialog').showModal();
    } else {
      $('fileInput').click();
    }
  };

  $('fileInput').onchange = async e => {
    const file = e.target.files?.[0];
    e.target.value = '';

    if (!file) return;

    try {
      const data = await MapFiles.read(file);

      openUploaded({
        ...data,
        completed: [],
        key: previewSignature(data)
      });
    } catch (err) {
      toast('Import failed: ' + err.message);
    }
  };

  $('homeBtn').onclick = () => {
    const go = () => {
      $('workspace').classList.add('hidden');
      $('home').classList.remove('hidden');
    };

    if (mode === 'create' && Checkpoints.list().length) {
      ask(
        'Return to home?',
        'Your draft is saved in this browser. Export a TXT backup to keep a portable copy.',
        go
      );
    } else {
      go();
    }
  };

  const swatches = $('swatches');

  for (const color of palettes) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.background = color;
    b.title = color;
    b.onclick = () => $('pointColor').value = color;
    swatches.append(b);
  }
})();

// Disable entrance animations after the initial page load.
window.setTimeout(
  () => document.body.classList.remove('initial-menu'),
  1900
);
