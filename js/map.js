
'use strict';

window.MapView = (() => {
  const WIDTH = 1419, HEIGHT = 2048;
  const paths = { default: 'assets/gta_5_map.webp' };

  let map, overlay, style = 'default', clickHandler = null;
  const markers = new Map();
  const bounds = [[0, 0], [HEIGHT, WIDTH]];

  function init(onClick) {
    clickHandler = onClick;

    map = L.map('map', {
      crs: L.CRS.Simple,
      minZoom: -3,
      maxZoom: 3,
      zoomSnap: .25,
      zoomDelta: .5,
      attributionControl: false,
      zoomControl: true
    });

    overlay = L.imageOverlay(paths[style], bounds, {
      interactive: false
    }).addTo(map);

    map.fitBounds(bounds);
    map.setMaxBounds([
      [-HEIGHT * .35, -WIDTH * .35],
      [HEIGHT * 1.35, WIDTH * 1.35]
    ]);

    map.on('click', e => clickHandler?.(e.latlng));
  }

  function setStyle(next) {
    if (!paths[next]) return;
    style = next;
    if (overlay) overlay.setUrl(paths[style]);
  }

  function popupContent(p, editable, onEdit) {
    const wrap = document.createElement('div');

    const name = document.createElement('div');
    name.className = 'popup-name';
    name.textContent = p.name;
    wrap.append(name);

    if (p.description) {
      const desc = document.createElement('div');
      desc.className = 'popup-desc';
      desc.textContent = p.description;
      wrap.append(desc);
    }

    if (editable) {
      const button = document.createElement('button');
      button.className = 'popup-edit';
      button.textContent = 'Edit checkpoint';

      button.addEventListener('click', e => {
        e.stopPropagation();
        map.closePopup();
        onEdit(p.id);
      });

      wrap.append(button);
    }

    return wrap;
  }

  function checkpointIcon(color, done) {
    return L.divIcon({
      className: '',
      html: `<div class="checkpoint-pin ${done ? 'checkpoint-done' : ''}" style="background:${color}"></div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });
  }

  function render(points, onSelect, completed = new Set()) {
    if (!map) return;

    const activeIds = new Set(points.map(p => p.id));

    // Remove only checkpoints that no longer exist.
    for (const [id, marker] of markers) {
      if (!activeIds.has(id)) {
        marker.remove();
        markers.delete(id);
      }
    }

    for (const p of points) {
      const position = [p.y * HEIGHT, p.x * WIDTH];
      const done = completed.has(p.id);
      const marker = markers.get(p.id);

      if (marker) {
        // Reuse existing markers instead of recreating them.
        const old = marker._checkpointData;

        if (old.x !== p.x || old.y !== p.y) {
          marker.setLatLng(position);
        }

        if (old.color !== p.color || old.done !== done) {
          marker.setIcon(checkpointIcon(p.color, done));
        }

        marker._checkpointData = {
          x: p.x,
          y: p.y,
          color: p.color,
          done
        };

        marker._checkpointSelect = onSelect;
      } else {
        // Create a marker only for a new checkpoint.
        const created = L.marker(position, {
          icon: checkpointIcon(p.color, done),
          bubblingMouseEvents: false
        }).addTo(map);

        created.bindPopup(document.createElement('div'));

        created._checkpointData = {
          x: p.x,
          y: p.y,
          color: p.color,
          done
        };

        created._checkpointSelect = onSelect;

        created.on('click', e => {
          if (e.originalEvent) {
            L.DomEvent.stopPropagation(e.originalEvent);
          }

          created._checkpointSelect(p.id);
        });

        markers.set(p.id, created);
      }
    }
  }

  function focus(p) {
    const marker = markers.get(p.id);
    if (!marker) return;

    map.setView(
      marker.getLatLng(),
      Math.max(map.getZoom(), 0),
      { animate: true }
    );
  }

  function showPopup(p, editable, onEdit) {
    const marker = markers.get(p.id);
    if (!marker) return;

    marker.getPopup().setContent(
      popupContent(p, editable, onEdit)
    );

    marker.openPopup();
  }

  function fit() {
    map?.fitBounds(bounds);
  }

  function refresh() {
    setTimeout(() => map?.invalidateSize(), 230);
  }

  function normalize(latlng) {
    return {
      x: latlng.lng / WIDTH,
      y: latlng.lat / HEIGHT
    };
  }

  function inBounds(p) {
    return p.x >= 0 && p.x <= 1 &&
           p.y >= 0 && p.y <= 1;
  }

  return {
    init,
    setStyle,
    render,
    focus,
    showPopup,
    fit,
    refresh,
    normalize,
    inBounds,
    getStyle: () => style
  };
})();
