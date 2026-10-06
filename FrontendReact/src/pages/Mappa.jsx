import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PhoneFrame } from '../components/PhoneFrame';
import { HeaderBanner } from '../components/HeaderBanner';
import { useApp } from '../context/AppContext';
import { useRideTracking } from '../context/RideTrackingContext';
import { mapService, POI_LAYERS } from '../services/mapService';
import { groupService } from '../services/groupService';
import { shouldPollNow } from '../native/appState';
import { useRefreshOn } from '../native/pushState';
import { routeService } from '../services/routeService';
import { geohashesForBounds } from '../utils/geohash';
import { dateTimeShort, formatDuration, formatKm } from '../utils/statsFormat';

/** Carica Leaflet (JS + CSS) dal bundle e lo espone come window.L, usato dal resto della pagina. */
const loadLeaflet = () => (window.L
  ? Promise.resolve(window.L)
  : Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(([mod]) => {
    window.L = mod.default || mod;
    return window.L;
  }));

/** Zoom minimo per caricare i punti d'interesse (celle geohash di ~5 km). */
export const POI_MIN_ZOOM = 14;
const DEFAULT_VIEW = [45.4642, 9.19]; // solo centro iniziale della mappa, nessun marcatore
const GROUP_POLL_MS = 20000;
const SHARE_EVERY_MS = 30000;

const LAYER_COLORS = {
  parkings: '#72CA67',
  fountains: '#38BDF8',
  toilets: '#A78BFA',
  repair: '#F59E0B'
};

/** Escape HTML per i testi provenienti dai dati (nomi OSM, username). */
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const yesNo = (value, t) => (value === true ? (t.yes || 'Sì') : value === false ? (t.no || 'No') : null);

/** Contenuto del popup di un punto d'interesse con i soli campi presenti nei dati. */
const poiPopup = (layer, item, t, labels) => {
  const rows = [];
  if (layer === 'parkings') {
    if (item.capacity) rows.push(`${t.mapPoiCapacity || 'Posti'}: ${esc(item.capacity)}`);
    if (yesNo(item.covered, t)) rows.push(`${t.mapPoiCovered || 'Coperto'}: ${yesNo(item.covered, t)}`);
    if (yesNo(item.fee, t)) rows.push(`${t.mapPoiFee || 'A pagamento'}: ${yesNo(item.fee, t)}`);
    if (item.access) rows.push(`${t.mapPoiAccess || 'Accesso'}: ${esc(item.access)}`);
  } else if (layer === 'fountains') {
    if (item.type === 'house') rows.push(t.mapPoiWaterHouse || 'Casa dell\'acqua');
  } else if (layer === 'toilets') {
    if (yesNo(item.fee, t)) rows.push(`${t.mapPoiFee || 'A pagamento'}: ${yesNo(item.fee, t)}`);
    if (item.openingHours) rows.push(`${t.mapPoiHours || 'Orari'}: ${esc(item.openingHours)}`);
    if (item.changingTable) rows.push(t.mapPoiChangingTable || 'Fasciatoio');
  } else if (layer === 'repair') {
    if (item.openingHours) rows.push(`${t.mapPoiHours || 'Orari'}: ${esc(item.openingHours)}`);
    if (item.phone) rows.push(`${t.mapPoiPhone || 'Telefono'}: ${esc(item.phone)}`);
  }
  return `
    <div class="ror-map-popup">
      <span class="ror-popup-tag ror-tag-parking">${esc(labels[layer])}</span>
      <h4 class="ror-popup-title">${esc(item.name || labels[layer])}</h4>
      ${rows.length ? `<p class="ror-popup-desc">${rows.join('<br>')}</p>` : ''}
    </div>`;
};

const triggerHaptic = (pattern = 25) => {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
  } catch {
    // ignorato
  }
};

/**
 * Pagina Mappa (Leaflet + OpenStreetMap) con dati reali:
 * - punti d'interesse dal database del backend (/api/v1/*, per geohash);
 * - posizioni in tempo reale dei membri dei miei gruppi che la condividono;
 * - un percorso registrato (?percorso=<id>) e un gruppo specifico (?gruppo=<id>).
 */
export const Mappa = () => {
  const { t, language, userProfile } = useApp();
  const tracking = useRideTracking();
  const [searchParams] = useSearchParams();
  const routeId = searchParams.get('percorso');
  const groupParam = searchParams.get('gruppo');

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const currentMarkerRef = useRef(null);
  const accuracyCircleRef = useRef(null);
  const watchIdRef = useRef(null);
  const poiLayersRef = useRef({});
  const loadedCellsRef = useRef({});
  const groupLayerRef = useRef(null);
  const pollGroupsRef = useRef(() => {});
  const routeLayerRef = useRef(null);
  const liveLayerRef = useRef(null);
  const lastShareRef = useRef(0);

  const [mapReady, setMapReady] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [zoomTooLow, setZoomTooLow] = useState(false);
  const [activeLayers, setActiveLayers] = useState({ parkings: true, fountains: false, toilets: false, repair: false, group: true });
  const [isTracking, setIsTracking] = useState(false);
  const [groupCount, setGroupCount] = useState(0);
  const [routeInfo, setRouteInfo] = useState(null);

  const layerLabels = {
    parkings: t.mapFilterParkings || 'Parcheggi bici',
    fountains: t.mapFilterFountains || 'Fontanelle',
    toilets: t.mapFilterToilets || 'Bagni',
    repair: t.mapFilterRepair || 'Ciclofficine'
  };
  const labelsRef = useRef(layerLabels);
  labelsRef.current = layerLabels;
  const tRef = useRef(t);
  tRef.current = t;

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3200);
  }, []);

  // ------------------------------------------------------------------
  // Inizializzazione Leaflet
  // ------------------------------------------------------------------
  useEffect(() => {
    const initMap = () => {
      if (!window.L || !mapRef.current || mapInstanceRef.current) return;
      const L = window.L;
      // preferCanvas: migliaia di punti d'interesse senza rallentamenti
      const map = L.map(mapRef.current, { zoomControl: false, attributionControl: true, preferCanvas: true })
        .setView(DEFAULT_VIEW, 15);
      mapInstanceRef.current = map;
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);

      Object.keys(POI_LAYERS).forEach((key) => {
        poiLayersRef.current[key] = L.layerGroup();
        loadedCellsRef.current[key] = new Set();
      });
      groupLayerRef.current = L.layerGroup().addTo(map);
      setTimeout(() => map.invalidateSize(), 200);
      setMapReady(true);
    };

    // Leaflet fa parte della build (pacchetto npm, caricato solo quando si apre la mappa): nessun CDN esterno
    let cancelled = false;
    loadLeaflet().then(() => { if (!cancelled) initMap(); });

    return () => {
      cancelled = true;
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // ------------------------------------------------------------------
  // Punti d'interesse dal backend (per geohash, con cache per cella)
  // ------------------------------------------------------------------
  const refreshPois = useCallback(async () => {
    const map = mapInstanceRef.current;
    const L = window.L;
    if (!map || !L) return;
    const tooLow = map.getZoom() < POI_MIN_ZOOM;
    setZoomTooLow(tooLow);

    Object.entries(poiLayersRef.current).forEach(([key, layer]) => {
      const visible = activeLayers[key] && !tooLow;
      if (visible && !map.hasLayer(layer)) map.addLayer(layer);
      if (!visible && map.hasLayer(layer)) map.removeLayer(layer);
    });
    if (tooLow) return;

    const b = map.getBounds();
    const cells = geohashesForBounds({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
    await Promise.all(Object.keys(POI_LAYERS).filter((key) => activeLayers[key]).map(async (key) => {
      const loaded = loadedCellsRef.current[key];
      const missing = cells.filter((c) => !loaded.has(c));
      if (!missing.length) return;
      missing.forEach((c) => loaded.add(c));
      try {
        const items = await mapService.getPoints(key, missing);
        items.forEach((item) => {
          if (typeof item.lat !== 'number' || typeof item.lng !== 'number') return;
          L.circleMarker([item.lat, item.lng], {
            radius: 6, color: '#0F171A', weight: 1.5, fillColor: LAYER_COLORS[key], fillOpacity: 0.9
          }).bindPopup(poiPopup(key, item, tRef.current, labelsRef.current)).addTo(poiLayersRef.current[key]);
        });
      } catch {
        missing.forEach((c) => loaded.delete(c)); // si riproverà al prossimo spostamento
        showToast(tRef.current.mapPoiError || 'Impossibile caricare i punti della mappa');
      }
    }));
  }, [activeLayers, showToast]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!mapReady || !map) return undefined;
    let timer;
    const onMove = () => {
      clearTimeout(timer);
      timer = setTimeout(refreshPois, 400);
    };
    refreshPois();
    map.on('moveend', onMove);
    return () => {
      clearTimeout(timer);
      map.off('moveend', onMove);
    };
  }, [mapReady, refreshPois]);

  // ------------------------------------------------------------------
  // Posizioni dei membri dei miei gruppi
  // ------------------------------------------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = groupLayerRef.current;
    if (!mapReady || !map || !layer) return undefined;
    if (!activeLayers.group) {
      if (map.hasLayer(layer)) map.removeLayer(layer);
      return undefined;
    }
    if (!map.hasLayer(layer)) map.addLayer(layer);

    let cancelled = false;
    let firstFit = Boolean(groupParam);
    const poll = async () => {
      try {
        // tutti i gruppi con una sola richiesta (prima la lista più una richiesta per gruppo, ogni 20 s)
        const { positions, groupCount: count } = groupParam
          ? { positions: await groupService.positions(groupParam).catch(() => []), groupCount: 1 }
          : await groupService.allPositions();
        if (cancelled) return;
        setGroupCount(count);
        const byUser = new Map();
        positions.forEach((p) => byUser.set(p.userId, p));
        const L = window.L;
        layer.clearLayers();
        const points = [];
        byUser.forEach((p) => {
          const icon = L.divIcon({
            className: 'group-member-pin-container',
            html: `<div class="ror-pin-badge" style="background:#0F171A;color:#00E5FF;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;">${esc((p.username || '?').charAt(0).toUpperCase())}</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          });
          const seen = p.ts ? new Date(p.ts).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' }) : '';
          L.marker([p.lat, p.lon], { icon }).bindPopup(`
            <div class="ror-map-popup">
              <span class="ror-popup-tag ror-tag-user">${esc(tRef.current.mapGroupMember || 'Membro del gruppo')}</span>
              <h4 class="ror-popup-title">${esc(p.username)}</h4>
              ${seen ? `<p class="ror-popup-desc">${esc(tRef.current.mapLastUpdate || 'Aggiornata alle')} ${esc(seen)}</p>` : ''}
            </div>`).addTo(layer);
          points.push([p.lat, p.lon]);
        });
        if (firstFit && points.length && !routeId) {
          map.fitBounds(points, { padding: [60, 60], maxZoom: 16 });
          firstFit = false;
        }
      } catch {
        // gruppi non disponibili: il livello resta vuoto
      }
    };
    poll();
    pollGroupsRef.current = poll;
    // in background nessuno guarda la mappa: niente richieste, al ritorno useRefreshOn ricarica subito
    const interval = setInterval(() => { if (shouldPollNow()) poll(); }, GROUP_POLL_MS);
    return () => {
      cancelled = true;
      pollGroupsRef.current = () => {};
      clearInterval(interval);
    };
  }, [mapReady, activeLayers.group, groupParam, routeId, language]);
  useRefreshOn(['gruppi', 'sicurezza'], () => pollGroupsRef.current());

  // ------------------------------------------------------------------
  // Percorso registrato (?percorso=<id>)
  // ------------------------------------------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!mapReady || !map || !routeId) return undefined;
    let cancelled = false;
    routeService.get(routeId)
      .then((route) => {
        if (cancelled) return;
        const L = window.L;
        if (routeLayerRef.current) map.removeLayer(routeLayerRef.current);
        const latlngs = (route.points || []).map(([lat, lon]) => [lat, lon]);
        setRouteInfo(route);
        if (!latlngs.length) {
          showToast(tRef.current.routesGpxUnavailable || 'File GPX non disponibile');
          return;
        }
        const group = L.layerGroup([
          L.polyline(latlngs, { color: '#00E5FF', weight: 5, opacity: 0.9 }),
          L.circleMarker(latlngs[0], { radius: 7, color: '#0F171A', fillColor: '#72CA67', fillOpacity: 1 })
            .bindPopup(esc(tRef.current.routeStart || 'Partenza')),
          L.circleMarker(latlngs[latlngs.length - 1], { radius: 7, color: '#0F171A', fillColor: '#ef4444', fillOpacity: 1 })
            .bindPopup(esc(tRef.current.routeEnd || 'Arrivo'))
        ]).addTo(map);
        routeLayerRef.current = group;
        map.fitBounds(latlngs, { padding: [50, 50] });
      })
      .catch((err) => !cancelled && showToast(err?.message || 'Percorso non disponibile'));
    return () => { cancelled = true; };
  }, [mapReady, routeId, showToast]);

  // ------------------------------------------------------------------
  // Sessione di guida in corso (traccia locale) e SOS dei membri dei gruppi
  // ------------------------------------------------------------------
  const liveTrack = tracking?.ride?.status !== 'idle' ? tracking?.ride?.track : null;
  useEffect(() => {
    const map = mapInstanceRef.current;
    const L = window.L;
    if (!mapReady || !map || !L) return;
    if (!liveTrack || liveTrack.length === 0) {
      if (liveLayerRef.current) {
        map.removeLayer(liveLayerRef.current);
        liveLayerRef.current = null;
      }
      return;
    }
    if (liveLayerRef.current) liveLayerRef.current.setLatLngs(liveTrack);
    else {
      liveLayerRef.current = L.polyline(liveTrack, { color: '#72CA67', weight: 5, opacity: 0.9 }).addTo(map);
      // sessione in corso: la mappa si apre sull'ultima posizione (salvo percorso o gruppo richiesti)
      if (!routeId && !groupParam) map.setView(liveTrack[liveTrack.length - 1], 16);
    }
  }, [mapReady, liveTrack, routeId, groupParam]);

  const groupAlerts = tracking?.groupAlerts;
  useEffect(() => {
    const map = mapInstanceRef.current;
    const L = window.L;
    if (!mapReady || !map || !L) return undefined;
    const layer = L.layerGroup().addTo(map);
    (groupAlerts || []).filter((a) => typeof a.lat === 'number' && typeof a.lon === 'number').forEach((a) => {
      const icon = L.divIcon({
        className: 'sos-pin-container',
        html: '<div class="ror-pin-badge" style="background:#DC2626;color:#FFFFFF;font-weight:900;font-size:10px;display:flex;align-items:center;justify-content:center;">SOS</div>',
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });
      L.marker([a.lat, a.lon], { icon, zIndexOffset: 1000 }).bindPopup(`
        <div class="ror-map-popup">
          <span class="ror-popup-tag" style="background:#DC2626;color:#fff;">SOS</span>
          <h4 class="ror-popup-title">${esc(a.username)}</h4>
          <p class="ror-popup-desc">${esc(a.createdAt.slice(11, 16))}${a.phoneNumber ? ` • <a href="tel:${esc(a.phoneNumber.replace(/[^\d+]/g, ''))}">${esc(a.phoneNumber)}</a>` : ''}</p>
        </div>`).addTo(layer);
    });
    return () => { map.removeLayer(layer); };
  }, [mapReady, groupAlerts]);

  // ------------------------------------------------------------------
  // Posizione dell'utente
  // ------------------------------------------------------------------
  const canShareWithGroups = Boolean(userProfile?.sensorsEnabled && userProfile?.shareLocationWithGroups);

  /** Pubblica la posizione ai gruppi al massimo ogni 30 s (solo se l'utente l'ha permesso). */
  const maybeSharePosition = useCallback((lat, lon) => {
    if (!canShareWithGroups || !groupCount) return;
    const now = Date.now();
    if (now - lastShareRef.current < SHARE_EVERY_MS) return;
    lastShareRef.current = now;
    groupService.sharePosition(lat, lon).catch(() => {
      lastShareRef.current = 0;
    });
  }, [canShareWithGroups, groupCount]);

  const placeUserMarker = (lat, lon, popupHtml) => {
    const L = window.L;
    const map = mapInstanceRef.current;
    if (!L || !map) return;
    if (!currentMarkerRef.current) {
      const icon = L.divIcon({
        className: 'user-gps-marker-container',
        html: '<div class="ror-map-user-marker"><div class="ror-marker-pulse"></div><div class="ror-marker-core"></div></div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      currentMarkerRef.current = L.marker([lat, lon], { icon }).addTo(map).bindPopup(popupHtml);
    } else {
      currentMarkerRef.current.setLatLng([lat, lon]);
      currentMarkerRef.current.getPopup().setContent(popupHtml);
    }
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      showToast(t.geoUnsupported || 'Geolocalizzazione non supportata');
      return;
    }
    showToast(t.mapLocating || 'Individuazione posizione...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lon, accuracy } = pos.coords;
        mapInstanceRef.current?.setView([lat, lon], 16, { animate: true });
        placeUserMarker(lat, lon, `
          <div class="ror-map-popup">
            <span class="ror-popup-tag ror-tag-user">GPS</span>
            <h4 class="ror-popup-title">${esc(t.mapYouAreHere || 'Tu sei qui')}</h4>
            <p class="ror-popup-desc">±${Math.round(accuracy || 0)} m</p>
          </div>`);
        maybeSharePosition(lat, lon);
        showToast(t.mapLocated || '📍 Posizione aggiornata');
      },
      () => showToast(t.geoDenied || 'Impossibile accedere alla posizione GPS'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const toggleTracking = () => {
    if (!navigator.geolocation) {
      showToast(t.geoUnsupported || 'Geolocalizzazione non supportata');
      return;
    }
    if (isTracking) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (accuracyCircleRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(accuracyCircleRef.current);
        accuracyCircleRef.current = null;
      }
      setIsTracking(false);
      triggerHaptic(45);
      showToast(t.mapTrackingStoppedToast || 'Modalità Seguimi disattivata');
      return;
    }

    triggerHaptic([30, 40, 30]);
    showToast(canShareWithGroups && groupCount
      ? (t.mapTrackingSharingToast || 'Seguimi attivo: la tua posizione è visibile ai tuoi gruppi')
      : (t.mapTrackingStartedToast || 'Modalità Seguimi GPS attivata'));
    setIsTracking(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lon, accuracy, speed } = pos.coords;
        const L = window.L;
        const map = mapInstanceRef.current;
        if (!L || !map) return;
        map.setView([lat, lon], Math.max(map.getZoom(), 16), { animate: true });
        const speedKmh = speed ? Math.round(speed * 3.6) : 0;
        placeUserMarker(lat, lon, `
          <div class="ror-map-popup">
            <span class="ror-popup-tag ror-tag-user">${esc(t.mapMoving || 'In movimento')} 🚴</span>
            <h4 class="ror-popup-title">${esc(t.mapYouAreHere || 'Tu sei qui')}</h4>
            <p class="ror-popup-desc">±${Math.round(accuracy || 0)} m${speedKmh > 0 ? ` • ${speedKmh} km/h` : ''}</p>
          </div>`);
        if (accuracyCircleRef.current) {
          accuracyCircleRef.current.setLatLng([lat, lon]);
          accuracyCircleRef.current.setRadius(accuracy || 15);
        } else {
          accuracyCircleRef.current = L.circle([lat, lon], {
            radius: accuracy || 15, color: '#00E5FF', fillColor: '#00E5FF', fillOpacity: 0.15, weight: 1.5
          }).addTo(map);
        }
        maybeSharePosition(lat, lon);
      },
      () => showToast(t.mapWeakSignal || 'Segnale GPS debole o non disponibile'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 }
    );
  };

  const toggleLayer = (key) => {
    triggerHaptic(25);
    setActiveLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  /** Ricerca di un luogo (Nominatim / OpenStreetMap): sposta solo la vista. */
  const handleSearch = (e) => {
    if (e && e.key && e.key !== 'Enter') return;
    const query = searchQuery.trim();
    if (!query) return;
    showToast(t.mapSearching || 'Ricerca luogo...');
    fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=${encodeURIComponent(language || 'it')}&q=${encodeURIComponent(query)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.length > 0 && mapInstanceRef.current) {
          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);
          const map = mapInstanceRef.current;
          map.setView([lat, lon], 16, { animate: true });
          window.L.popup().setLatLng([lat, lon]).setContent(`
            <div class="ror-map-popup">
              <span class="ror-popup-tag ror-tag-user">${esc(t.mapSearchResult || 'Risultato')}</span>
              <h4 class="ror-popup-title">${esc(data[0].display_name.split(',')[0])}</h4>
              <p class="ror-popup-desc">${esc(data[0].display_name)}</p>
            </div>`).openOn(map);
        } else {
          showToast(t.mapNoResults || 'Nessun risultato trovato');
        }
      })
      .catch(() => showToast(t.mapSearchUnavailable || 'Ricerca non disponibile al momento'));
  };

  const chip = (key, label, icon) => (
    <button
      key={key}
      type="button"
      className={`map-chip-btn ${activeLayers[key] ? 'active' : ''}`}
      onClick={() => toggleLayer(key)}
      aria-pressed={activeLayers[key]}
    >
      <span className="map-chip-icon">{icon}</span>
      <span>{label}</span>
      {activeLayers[key] && <span className="map-chip-dot" aria-hidden="true"></span>}
    </button>
  );

  const dot = (color) => (
    <span aria-hidden="true" style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: color, border: '1.5px solid #0F171A' }}></span>
  );

  return (
    <PhoneFrame toolbarTitle="RoR Mappa">
      <HeaderBanner showProfileIcon={true} />

      <div className="app-content" style={{ position: 'relative', padding: 0, overflow: 'hidden', height: '100%' }}>
        <div ref={mapRef} id="map" aria-label={t.mapAria || 'Mappa interattiva'} style={{ width: '100%', height: '100%', minHeight: '480px', position: 'relative', overflow: 'hidden' }}></div>

        {/* RICERCA */}
        <div className="map-search-overlay">
          <div className="map-search-bar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#72CA67" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" onClick={handleSearch} style={{ cursor: 'pointer' }}>
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              id="searchInput"
              type="text"
              placeholder={t.mapSearchPh || 'Cerca un luogo o indirizzo...'}
              aria-label={t.mapSearchPh || 'Cerca un luogo o indirizzo...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearch}
            />
          </div>
        </div>

        {/* FILTRI */}
        <div className="map-filter-chips-overlay" role="toolbar" aria-label="Filtri Mappa">
          {Object.keys(POI_LAYERS).map((key) => chip(key, layerLabels[key], dot(LAYER_COLORS[key])))}
          {chip('group', t.mapFilterGroup || 'Gruppo', dot('#00E5FF'))}
          <button
            type="button"
            className={`map-chip-btn tracking-chip ${isTracking ? 'active' : ''}`}
            onClick={toggleTracking}
            aria-pressed={isTracking}
            title={t.mapTrackingTitle || 'Attiva o disattiva il tracciamento continuo della posizione GPS'}
          >
            <span className="map-chip-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
              </svg>
            </span>
            <span>{isTracking ? (t.mapTrackingActive || 'Seguimi Attivo') : (t.mapTrackingInactive || 'Modalità Seguimi')}</span>
            {isTracking && <span className="map-chip-dot" aria-hidden="true"></span>}
          </button>
        </div>

        {/* AVVISO ZOOM: in basso (top: auto, altrimenti con il top del CSS si allunga su tutta la mappa),
            sopra il riquadro del percorso e lasciando libero a destra lo spazio dei pulsanti dello zoom */}
        {zoomTooLow && Object.keys(POI_LAYERS).some((k) => activeLayers[k]) && (
          <div className="map-toast-notification show active" role="status"
            style={{ top: 'auto', bottom: routeInfo ? '150px' : '90px', left: '12px', right: '76px', transform: 'none', textAlign: 'center' }}>
            {t.mapZoomHint || 'Ingrandisci la mappa per vedere i punti in quest\'area.'}
          </div>
        )}

        {/* PERCORSO VISUALIZZATO */}
        {routeInfo && (
          <div role="status" style={{ position: 'absolute', left: '12px', right: '12px', bottom: '84px', zIndex: 500, background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: '14px', padding: '10px 12px', fontSize: '0.78rem', color: 'var(--text-main)' }}>
            <strong>{dateTimeShort(routeInfo.startedAt, language)}</strong>
            {` • ${formatKm(routeInfo.distanceKm, 2)} km • ${formatDuration(routeInfo.durationSec)} • ${(routeInfo.avgSpeedKmh || 0).toFixed(1)} km/h`}
          </div>
        )}

        <div className={`map-toast-notification ${toastMsg ? 'show active' : ''}`} id="mapToast" role="status">
          {toastMsg}
        </div>

        <button
          className={`locate-floating-btn ${isTracking ? 'tracking-active' : ''}`}
          id="locateBtn"
          title={t.mapLocateTitle || 'Trova la mia posizione GPS'}
          aria-label={t.mapLocateTitle || 'Trova la mia posizione GPS'}
          onClick={() => {
            triggerHaptic(25);
            handleLocateMe();
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isTracking ? '#00E5FF' : '#72CA67'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
          </svg>
        </button>
      </div>
    </PhoneFrame>
  );
};
