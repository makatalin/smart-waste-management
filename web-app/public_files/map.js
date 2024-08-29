import { filteredAndSortedBinsGlobal } from './main.js';

// ****************************
// INICIJALIZACIJA I POSTAVKE KARTE
// ****************************

let map = null;
let directionsRenderer;
let markerLayerGroup = L.layerGroup();
let isOptimizingRoute = false;
let trafficCheckInterval;

let bins = {}; // Objekt za spremanje podataka o spremnicima
let currentFiltered = null;

// Funkcija za dohvaćanje instance mape
export const getMap = () => map;

// Inicijalizacija mape s osnovnim slojevima
export const initializeMap = () => {
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    });

    const googleTrafficLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=h@159000000,traffic&style=3&x={x}&y={y}&z={z}', {
        maxZoom: 19,
        attribution: '© Google'
    });

    map = L.map('map').setView([45.815, 15.9719], 12);
    
    osmLayer.addTo(map);
    googleTrafficLayer.addTo(map);

    directionsRenderer = L.layerGroup(); // Sloj za rute
    markerLayerGroup = L.layerGroup(); // Sloj za markere

    markerLayerGroup.addTo(map);
    directionsRenderer.addTo(map);
}

// ****************************
// RAD S MARKERIMA
// ****************************

export const createMarkerIcon = (latestReading) => {
    let iconUrl;
    if (latestReading.plamen && latestReading.temperatura > 80 && latestReading.dim) {
        iconUrl = 'img/fire.png';
    } else if (latestReading.polozaj) {
        iconUrl = 'img/bin-tilt.png';
    } else {
        iconUrl = 'img/bin.png';
    }

    return L.icon({
        iconUrl: iconUrl,
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        popupAnchor: [0, -40],
        shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
        shadowSize: [41, 41]
    });
}

export const createMarker = (bin, icon) => {
    const latestReading = bin.ocitanja[0] || {};
    return L.marker([bin.lat, bin.lng], { icon: icon })
        .bindPopup(`
            <b>${bin.naziv}</b><br>
            Napunjenost: ${latestReading.napunjenost || 'N/A'}%<br>
            Položaj: ${latestReading.polozaj ? 'Prevrnut' : 'Ispravan'}<br>
            Temperatura: ${latestReading.temperatura || 'N/A'}°C<br>
            Plamen: ${latestReading.plamen ? 'Da' : 'Ne'}<br>
            Dim: ${latestReading.dim ? 'Da' : 'Ne'}
        `);
}

export const addMarker = (bin) => {
    if (!bin.lat || !bin.lng || bin.lat === 0 || bin.lng === 0) {
        console.warn('Nevažeće koordinate za marker:', bin.lat, bin.lng);
        return;
    }

    if (!bins[bin.id]) {
        console.error(`Spremnik s ID-jem ${bin.id} nije pronađen u bins objektu.`);
        return;
    }

    const latestReading = bin.ocitanja[0] || {};

    const icon = createMarkerIcon(latestReading);
    const marker = createMarker(bin, icon);

    marker.addTo(markerLayerGroup);
    bins[bin.id].marker = marker;

    if (latestReading.plamen && latestReading.temperatura > 80 && latestReading.dim) {
        marker._icon.classList.add('blink-marker');
    }
}

// Funkcija za uklanjanje markera s karte
export const removeMarker = (binId) => {
    if (bins[binId] && bins[binId].marker) {
        markerLayerGroup.removeLayer(bins[binId].marker);
        bins[binId].marker = null;
    }
  }

// Funkcija za upravljanje blinkanjem markera
export const toggleBlinkMarker = (binId) => {
    const bin = bins[binId];
    if (!bin) return;

    const marker = bin.marker;
    if (!marker || !marker._icon) return;

    const markerIcon = marker._icon;

    // Provjera trenutačnog stanja blinkanja i promjena
    if (bin.isBlinking) {
        markerIcon.classList.remove('blink-marker');
        bin.isBlinking = false;
    } else {
        markerIcon.classList.add('blink-marker');
        bin.isBlinking = true;
    }
}

// ****************************
// PRIKAZ GOOGLE RUTA I OPTIMIZACIJA
// ****************************

// Funkcija za dekodiranje polilinije (za rute)
export const decodePolyline = (encoded) => {
    let points = [];
    let index = 0, len = encoded.length;
    let lat = 0, lng = 0;

    while (index < len) {
        let b, shift = 0, result = 0;
        do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
        } while (b >= 0x20);
        let dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += dlat;

        shift = 0;
        result = 0;
        do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
        } while (b >= 0x20);
        let dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += dlng;

        points.push([lat / 1E5, lng / 1E5]);
    }

    return points;
}

// Funkcija za kreiranje ikone s brojem (za rute)
export const createNumberedIcon = (number) => {
    return L.divIcon({
        className: 'numbered-icon',
        html: `<div class="number">${number}</div>`,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });
}

// Prikaz optimizirane rute na karti
export const showRouteOnMap = (route) => {
    const legs = route.legs;

    // Postavljanje "start" ikone na početnu točku rute
    const startLeg = legs[0];
    L.marker([startLeg.start_location.lat, startLeg.start_location.lng], {
        icon: L.icon({
            iconUrl: 'img/start.png',
            iconSize: [35, 52],
            iconAnchor: [25, 52],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        })
    }).addTo(directionsRenderer).bindPopup(`Start: ${startLeg.start_address}`);

    // Dodavanje numeriranih markera na rutu osim za zadnju točku
    legs.forEach((leg, index) => {
        if (index < legs.length - 1) { // Provjera da nije zadnja točka
            const step = leg.end_location;

            // Offset za pomak markera sa strane spremnika
            const offsetLat = 0.00005 * (index % 2 === 0 ? 1 : -1);
            const offsetLng = 0.00005 * (index % 2 === 0 ? 1 : -1);

            L.marker([step.lat + offsetLat, step.lng + offsetLng], {
                icon: createNumberedIcon(index + 1)
            }).addTo(markerLayerGroup).bindPopup(`Step ${index + 1}: ${leg.end_address}`);
        }
    });

    // Postavljanje "end" ikone na krajnju točku rute
    const endLeg = legs[legs.length - 1];
    L.marker([endLeg.end_location.lat, endLeg.end_location.lng], {
        icon: L.icon({
            iconUrl: 'img/end.png',
            iconSize: [40, 62],
            iconAnchor: [25, 62],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        })
    }).addTo(directionsRenderer).bindPopup(`End: ${endLeg.end_address}`);

    setTimeout(() => {
        map.invalidateSize(); // Osvježavanje prikaza mape
    }, 100);
}

// Funkcija za pokretanje periodične provjere stanja prometa
export const startCheckingForTraffic = () => {
    trafficCheckInterval = setInterval(async () => {
        if (!isOptimizingRoute) {
        clearInterval(trafficCheckInterval);
        return;
        }
        await getOptimizedRoute(currentFiltered);
    }, 300000); // Ažuriranje rute svakih 5 minuta
}

// Funkcija za zaustavljanje provjere stanja prometa i čišćenje slojeva s karte
export const stopCheckingForTraffic = () => {
    if (directionsRenderer) {
        directionsRenderer.clearLayers();
    }
    if (markerLayerGroup) {
        markerLayerGroup.clearLayers();
    }

    isOptimizingRoute = false;

    const searchTerm = document.getElementById('pretraga-spremnika').value.toLowerCase().trim();
    let binsToDisplay;

    if (searchTerm) {
        binsToDisplay = filteredAndSortedBinsGlobal;
    } else {
        binsToDisplay = Object.values(bins);
    }

    // Vraćanje markera na kartu
    binsToDisplay.forEach(bin => {
        addMarker(bin);
        console.log("Marker dodan za spremnik: ", bin.id);
    });

    clearInterval(trafficCheckInterval);

    const map = getMap();
    if (map) {
        setTimeout(() => {
            map.invalidateSize();
        }, 100);
    } else {
        console.error("Mapa nije inicijalizirana.");
    }
};

// Funkcija za dohvaćanje optimizirane rute na temelju filtriranih spremnika
export const getOptimizedRoute = async (searchTerm) => {
    try {
        let binIds = Array.isArray(searchTerm) ? searchTerm : [];

        if (typeof searchTerm === 'object' && searchTerm.length > 0 && typeof searchTerm[0] === 'object') {
            binIds = searchTerm.map(bin => bin.id);
        }

        if (typeof searchTerm === 'string') {
            binIds = searchTerm.split(',');
        }

        const binIdString = binIds.join(',');

        console.log("Bin IDs:", binIds);

        if (!binIdString) {
            console.error('No bins found for the optimization route.');
            isOptimizingRoute = false;
            return;
        }

        const url = `/route/optimize-route?bins=${encodeURIComponent(binIdString)}`;
        console.log(`Requesting optimized route with URL: ${url}`);

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            directionsRenderer.clearLayers();

            const decodedPolyline = decodePolyline(route.overview_polyline.points);

            const polyline = L.polyline(decodedPolyline, { color: 'blue' }).addTo(directionsRenderer);
            map.fitBounds(polyline.getBounds());
            showRouteOnMap(route);
            
        } else {
            console.error('No routes found');
            isOptimizingRoute = false;
        }
    } catch (error) {
        console.error('Error fetching optimized route:', error);
        isOptimizingRoute = false;
    }
};

// Funkcija za uključivanje/isključivanje optimizacije rute
export const toggleRouteOptimization = async () => {
    if (isOptimizingRoute) {
        stopCheckingForTraffic();
        document.getElementById('show-route-btn').innerText = "Prikaži optimiziranu rutu";
        isOptimizingRoute = false;
    } else {
        document.getElementById('show-route-btn').innerText = "Zaustavi optimizaciju rute";

        // Ako nema pretraživanja, svi spremnici su dostupni
        let filteredBins;
        const searchTerm = document.getElementById('pretraga-spremnika').value.toLowerCase().trim();

        if (searchTerm) {
            filteredBins = filteredAndSortedBinsGlobal;
        } else {
            filteredBins = Object.values(bins);
            // Oznaka svih spremnika kao filtriranih
            filteredBins.forEach(bin => bin.isFiltered = true);
        }

        // Filtriranje prema napunjenosti ≥ 75%
        filteredBins = filteredBins.filter(bin => {
            const latestReading = bin.ocitanja[0] || {};
            return latestReading && latestReading.napunjenost >= 75;
        });

        markerLayerGroup.clearLayers();

        if (filteredBins.length > 0) {
            const binIds = filteredBins.map(bin => bin.id);
            console.log("Bin IDs:", binIds);

            // Dodavanje markera samo za filtrirane spremnike
            filteredBins.forEach(bin => {
                addMarker(bin);
            });

            isOptimizingRoute = true;
            await getOptimizedRoute(binIds); 
            startCheckingForTraffic();
        } else {
            console.error('Nema spremnika za optimiziranu rutu.');
            alert('Nema spremnika koji imaju napunjenost veću od 75%.');
            document.getElementById('show-route-btn').innerText = "Prikaži optimiziranu rutu";
            isOptimizingRoute = false;
            stopCheckingForTraffic();
        }
    }
};

// EKSPORTIRANJE FUNKCIJA I OBJEKATA

export function getMarkerLayerGroup() {
    return markerLayerGroup;
}

export default {
    initializeMap,
    addMarker,
    toggleBlinkMarker,
    removeMarker,
    getOptimizedRoute,
    getMarkerLayerGroup,
    decodePolyline,
    createNumberedIcon,
    showRouteOnMap,
    startCheckingForTraffic,
    stopCheckingForTraffic,
    toggleRouteOptimization,
    getMap,
    bins
};
