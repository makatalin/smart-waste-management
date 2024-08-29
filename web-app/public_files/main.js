import mapFunctions from './map.js';

const { 
  initializeMap, 
  addMarker, 
  removeMarker, 
  toggleBlinkMarker, 
  toggleRouteOptimization, 
  getMarkerLayerGroup,
  startCheckingForTraffic, 
  getMap,
  bins
} = mapFunctions;

let map;
let markerLayerGroup;
let spremnici = [];

// Globalne varijable za filtriranje i sve spremnike
export let filteredAndSortedBinsGlobal = [];
export let allBinsGlobal = [];

// Debounce za pretraživanje
function debounce(fn, delay) {
  let timeoutId;
  return function(...args) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

const debouncedSearch = debounce(handleSearchSpremnici, 300);

document.addEventListener('DOMContentLoaded', () => { 
  // Inicijalizirranje pretraživanja spremnika
  const searchInput = document.getElementById('pretraga-spremnika');
  if (searchInput) {
    const storedSearchTerm = localStorage.getItem('currentSearchTerm') || '';
    searchInput.value = storedSearchTerm;

    handleSearchSpremnici({ target: searchInput });

    searchInput.addEventListener('input', debouncedSearch);
  } else {
    console.error('Element s ID-om "pretraga-spremnika" nije pronađen.');
  }

  if (typeof initializeMap === 'function') {
    initializeMap();
  }

  map = getMap();
  markerLayerGroup = getMarkerLayerGroup();

  // Dodavanje naslova i učitavanje spremnika
  addSpremnikNaslovi();
  loadBinsAndReadings();
  
  // Interakcija s korisnikom
  const addForm = document.getElementById('dodaj-spremnik-form');
  addForm.addEventListener('submit', handleSubmit);
  document.getElementById('dodaj-spremnik-btn').addEventListener('click', () => {
    clearForm();
    toggleForm('dodaj-spremnik-form');
  });
  

  document.getElementById('show-route-btn').addEventListener('click', toggleRouteOptimization);
  document.getElementById('odustani').addEventListener('click', () => toggleForm('dodaj-spremnik-form'));
  
  // Provjere za nove spremnike (Raspberry) i promet za optimizacijsku rutu
  startCheckingForNewBins();
  startCheckingForTraffic();
  
  // SSE (Server-Sent Events)
  const eventSource = new EventSource('/events');

  eventSource.onmessage = (event) => {
      const eventData = JSON.parse(event.data);

      if (eventData.action === 'newBin' || eventData.action === 'updateBin') {
          const binData = eventData.data;
          addOrUpdateBin(binData);
      }
  };

  async function addOrUpdateBin(binData) {
    if (!binData.lat || !binData.lng || binData.lat === 0 || binData.lng === 0) {
        binData.address = 'Adresa nije dostupna';
    } else {
      binData.address = await fetchAddress(binData.lat, binData.lng);
    }

    const existingBin = mapFunctions.bins[binData.id];

    if (existingBin) {
        mapFunctions.bins[binData.id] = {
            ...existingBin,
            ...binData,
            ocitanja: binData.ocitanja || existingBin.ocitanja
        };
        updateBin(mapFunctions.bins[binData.id]);
    } else {
        mapFunctions.bins[binData.id] = binData;
        addBinToList(binData);
        addMarker(binData);
    }

    sortAndDisplayList();
    checkFillLevels();
  }

  // Funkcija za sortiranje i prikaz popisa spremnika
  function sortAndDisplayList() {
    const searchTerm = localStorage.getItem('currentSearchTerm') || '';
    const sortedBins = filterAndSortBins(Object.values(mapFunctions.bins), searchTerm);
    displayFilteredBins(sortedBins);
  }

  // Klikom na spremnik u popisu aktivira se blinkanje markera na karti
  document.getElementById('spremnici-lista').addEventListener('click', (event) => {
  const binDiv = event.target.closest('.spremnik-item');
  if (binDiv && 
    !event.target.classList.contains('update-btn') && 
    !event.target.classList.contains('delete-btn')
  ) {
      const binId = binDiv.id.split('-')[1];
      toggleBlinkMarker(parseInt(binId));
  }

});
});

window.addEventListener('beforeunload', () => {
  localStorage.removeItem('currentSearchTerm');
});

// Funkcija za rukovanje pretragom spremnika
async function handleSearchSpremnici(event) {
  const searchTerm = event.target.value.toLowerCase().trim();

  localStorage.setItem('currentSearchTerm', searchTerm);

  const sortedAndFilteredBins = filterAndSortBins(Object.values(mapFunctions.bins), searchTerm);
  //console.log('Filtered and Sorted Bins:', sortedAndFilteredBins);
  
  allBinsGlobal = [...sortedAndFilteredBins];
  filteredAndSortedBinsGlobal = sortedAndFilteredBins;

  displayFilteredBins(sortedAndFilteredBins);
}

// Funkcija za definiranje parametara za pretraživanje
export function filterAndSortBins(bins, searchTerm) {
  let binsToDisplay = bins;

  if (searchTerm) {
      binsToDisplay = binsToDisplay.filter(bin => {
          const matchesNaziv = bin.naziv.toLowerCase().includes(searchTerm);
          const matchesNapunjenost = bin.ocitanja && bin.ocitanja.some(ocitanje => ocitanje.napunjenost.toString().includes(searchTerm));
          const matchesPolozaj = bin.ocitanja && bin.ocitanja.some(ocitanje => ocitanje.polozaj ? 'prevrnut'.includes(searchTerm) : 'ispravan'.includes(searchTerm));
          const matchesTemperatura = bin.ocitanja && bin.ocitanja.some(ocitanje => ocitanje.temperatura.toString().includes(searchTerm));
          const matchesPlamen = bin.ocitanja && bin.ocitanja.some(ocitanje => ocitanje.plamen ? 'da'.includes(searchTerm) : 'ne'.includes(searchTerm));
          const matchesDim = bin.ocitanja && bin.ocitanja.some(ocitanje => ocitanje.dim ? 'da'.includes(searchTerm) : 'ne'.includes(searchTerm));
          const matchesBaterija = bin.ocitanja && bin.ocitanja.some(ocitanje => ocitanje.baterija.toString().includes(searchTerm));
          const matchesAdresa = bin.address && bin.address.toLowerCase().includes(searchTerm);
          const matchesPodrucje = bin.podrucje && bin.podrucje.toLowerCase().includes(searchTerm);
          const matchesVrstaOtpada = bin.vrsta_otpad && bin.vrsta_otpad.toLowerCase().includes(searchTerm);

          const matches = (
              matchesNaziv ||
              matchesNapunjenost ||
              matchesPolozaj ||
              matchesTemperatura ||
              matchesPlamen ||
              matchesDim ||
              matchesBaterija ||
              matchesAdresa ||
              matchesPodrucje ||
              matchesVrstaOtpada
          );

          bin.isFiltered = matches;
          return matches;
      });
  } else {
      // Ako nema searchTerm, svi spremnici su označeni kao da su filtrirani
      binsToDisplay.forEach(bin => bin.isFiltered = true);
  }

  binsToDisplay = binsToDisplay.filter((bin, index, self) =>
    index === self.findIndex((b) => (
      b.id === bin.id
    ))
  );

  return sortBins(binsToDisplay);
}

// Funkcija za osvježavanje popisa spremnnika prilikom pretaživanja
async function refreshBinList(searchTerm = '') {
  const sortedBins = filterAndSortBins(Object.values(mapFunctions.bins), searchTerm);
  await displayFilteredBins(sortedBins);
}

// Funkcija za učitavanje spremnika i njihovih očitanja
async function loadBinsAndReadings() {
  try {
      const response = await fetch('/rest/spremnici');
      const data = await response.json();

      if (!Array.isArray(data)) {
          console.error('Primljeni podaci nisu polje:', data);
          return;
      }

      const spremnici = data;

      const container = document.getElementById('spremnici-lista');
      if (container) {
          container.innerHTML = '';
      }

      markerLayerGroup.clearLayers();

      // Ažuriranje bins objekta
      const newBins = {};
      for (const bin of data) {
          newBins[bin.id] = {
              ...bin,
              ocitanja: [bin],
              nepravilnosti: calculateIrregularities(bin)
          };
      }

      // Poziv za ažuriranje bins objekta u map.js
      updateBins(newBins);

      // Dodavanje markera za svaki spremnik
      for (const binId in newBins) {
          addMarker(newBins[binId]);
      }

      // Prikaz spremnika na popisu
      displayFilteredBins(Object.values(newBins));
      checkFillLevels(); 

  } catch (error) {
      console.error('Error loading bins:', error);
  }
}


// Funkcija za sortiranje spremnika u generiranom popisu po prioritetima
function sortBins(bins) {
  return bins.sort((a, b) => {
    const getPriority = (bin) => {
      const latestReading = bin.ocitanja[0] || {};
      const nepravilnosti = calculateIrregularities(bin);

      // Prvo se izračunava broj nepravilnosti na temelju kojih će se sortirati
      let criticalScore = nepravilnosti;

      // Ako je požar (plamen + dim + visoka temperatura), ima najveći prioritet
      if (latestReading.plamen && latestReading.dim && latestReading.temperatura > 80) {
        return Number.MAX_SAFE_INTEGER; // Najveći prioritet
      }

      // Ako je visoka napunjenost + visoka temperatura ili dim
      if (latestReading.napunjenost >= 75 && (latestReading.temperatura > 80 || latestReading.dim)) {
        criticalScore += 4;
      }

      // Ako je visoka temperatura i dim bez napunjenosti
      if (latestReading.temperatura > 80 && latestReading.dim) {
        criticalScore += 3;
      }

      // Ako je visoka napunjenost + prevrnut položaj
      if (latestReading.napunjenost >= 75 && latestReading.polozaj) {
        criticalScore += 3;
      }

      // Ako je samo visoka napunjenost
      if (latestReading.napunjenost >= 75) {
        criticalScore += 2;
      }

      // Ako je samo prevrnut položaj ili visoka temperatura bez drugih faktora
      if (latestReading.polozaj || latestReading.temperatura > 80) {
        criticalScore += 2;
      }

      return criticalScore;
    };

    const priorityA = getPriority(a);
    const priorityB = getPriority(b);

    // Viši criticalScore dolazi prvi
    if (priorityA !== priorityB) {
      return priorityB - priorityA;
    }

    // Ako imaju isti criticalScore, sortira se prema napunjenosti
    const napunjenostA = a.ocitanja[0] ? a.ocitanja[0].napunjenost : 0;
    const napunjenostB = b.ocitanja[0] ? b.ocitanja[0].napunjenost : 0;

    return napunjenostB - napunjenostA;
  });
}

// Funkcija za ažuriranje bins objekta
function updateBins(newBins) {
  for (const id in mapFunctions.bins) {
    delete mapFunctions.bins[id];
  }

  Object.assign(mapFunctions.bins, newBins);
}

// Funkcija za provjeru novih spremnika dodanih preko Raspberry Pi-ja
function startCheckingForNewBins() {
  setInterval(async () => {
    try {
      const response = await fetch('/rest/spremnici');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      //console.log("Fetched data:", data);

      if (Array.isArray(data)) {
        const newBins = data.filter(bin => !mapFunctions.bins[bin.id]);

        if (newBins.length > 0) {
          for (const newBin of newBins) {
            const fetchResponse = await fetch(`/rest/spremnici/${newBin.id}`);
            const updatedSpremnik = await fetchResponse.json();

            mapFunctions.bins[newBin.id] = {
              ...newBin,
            ocitanja: updatedSpremnik.data && updatedSpremnik.data.ocitanja.length > 0
                ? [updatedSpremnik.data.ocitanja[0]]
                : [],
            };
            
            addBinToList(mapFunctions.bins[newBin.id]);
            addMarker(mapFunctions.bins[newBin.id]);
          }
          checkFillLevels();
        } else {
          console.log('Nema novih spremnika.');
        }
      } else {
        console.error('Primljeni podaci nisu polje:', data);
      }
    } catch (error) {
      console.error('Error checking for new bins:', error);
    }
  }, 3000); // Provjera novih spremnika svake 3 sekunde
}

// Funkcija za prebacivanje prikaza forme
function toggleForm(formId) {
  const form = document.getElementById(formId);
  if (form) {
    form.style.display = form.style.display === 'block' ? 'none' : 'block';
  } else {
    console.error(`Forma sa ID-jem ${formId} nije pronađena.`);
  }
}

// Funkcija za čišćenje forme
function clearForm() {
  document.getElementById('spremnik-id').value = '';
  document.getElementById('naziv').value = '';
  document.getElementById('rfid').value = '';
  document.getElementById('lat').value = '';
  document.getElementById('lng').value = '';
  document.getElementById('napunjenost').value = '';
  document.getElementById('temperatura').value = '';
  document.getElementById('plamen').value = 'false';
  document.getElementById('polozaj').value = 'false';
  document.getElementById('baterija').value = '';
  document.getElementById('dim').value = 'false';
  document.getElementById('volumen').value = '';
  document.getElementById('podrucje').value = '';
  document.getElementById('vrsta').value = '';
}

// Funkcija za otvaranje forme za ažuriranje spremnika
function openUpdateForm(binId) {  
  const bin = mapFunctions.bins[binId];
  if (!bin) return;

  const form = document.getElementById('dodaj-spremnik-form');
  document.getElementById('spremnik-id').value = bin.id;
  document.getElementById('naziv').value = bin.naziv;
  document.getElementById('rfid').value = bin.rfid;
  document.getElementById('lat').value = bin.lat;
  document.getElementById('lng').value = bin.lng;
  document.getElementById('volumen').value = bin.volumen;
  document.getElementById('podrucje').value = bin.podrucje;
  const vrstaSelect = document.getElementById('vrsta');
  vrstaSelect.value = bin.vrsta_otpad || '';

  // Postavljanje očitanja u formu
  const latestReading = bin.ocitanja[0] || {};
  document.getElementById('napunjenost').value = latestReading.napunjenost !== undefined ? latestReading.napunjenost : '';
  document.getElementById('temperatura').value = latestReading.temperatura !== undefined ? latestReading.temperatura : '';
  document.getElementById('plamen').value = latestReading.plamen ? 'true' : 'false';
  document.getElementById('polozaj').value = latestReading.polozaj ? 'true' : 'false';
  document.getElementById('baterija').value = latestReading.baterija !== undefined ? latestReading.baterija : '';
  document.getElementById('dim').value = latestReading.dim ? 'true' : 'false';

  form.style.display = 'block';
}

window.openUpdateForm = openUpdateForm;

// Funkcija za prikaz filtriranih spremnika
async function displayFilteredBins(filteredSpremnici) {
  const container = document.getElementById('spremnici-lista');
  const existingBins = new Map();

  container.querySelectorAll('.spremnik-item').forEach(binDiv => {
      const binId = binDiv.id.split('-')[1];
      existingBins.set(parseInt(binId), binDiv);
  });

  container.innerHTML = '';
  addSpremnikNaslovi();

  const sortiraniSpremnici = sortBins(filteredSpremnici);

  await Promise.all(sortiraniSpremnici.map(async (bin) => {
      if (!bin.address) {
          bin.address = await fetchAddress(bin.lat, bin.lng);
      }
  }));

  for (const bin of sortiraniSpremnici) {
      let binDiv;
      if (existingBins.has(bin.id)) {
          binDiv = existingBins.get(bin.id);
      } else {
          binDiv = await createBinDiv(bin);
      }
      container.appendChild(binDiv);
  }

  markerLayerGroup.clearLayers();
  sortiraniSpremnici.forEach(bin => {
      addMarker(bin);
  });
}


// Funkcija za dodavanje naslova spremnnika na popisu
function addSpremnikNaslovi() {
  const spremniciLista = document.getElementById('spremnici-lista');

  const naslovDiv = document.createElement('div');
  naslovDiv.className = 'spremnik-naslov spremnik-item';

  naslovDiv.innerHTML = `
      <span class="col-naziv">Naziv</span>
      <span class="col-napunjenost">Pun %</span>
      <span class="col-polozaj">Položaj</span>
      <span class="col-temperatura">Temp °C</span>
      <span class="col-plamen">Plamen</span>
      <span class="col-dim">Dim</span>
      <span class="col-baterija">Baterija</span>
      <span class="col-adresa">Adresa</span>
      <span class="col-podrucje">Područje</span>
      <span class="col-vrsta">Vrsta otpada</span>
      <span class="col-akcije"></span>
  `;

  spremniciLista.appendChild(naslovDiv);
}

// Funkcija za izračun nepravilnosti spremnika
function calculateIrregularities(bin) {
  if (!bin.ocitanja || bin.ocitanja.length === 0) {
    return 0; // Nema očitanja, nema nepravilnosti
  }

  // Uzima samo zadnje očitanje
  const latestReading = bin.ocitanja[0] || {};

  let nepravilnosti = 0;
  if (latestReading.polozaj) nepravilnosti++;
  if (latestReading.napunjenost > 75) nepravilnosti++;
  if (latestReading.temperatura > 80) nepravilnosti++;
  if (latestReading.plamen) nepravilnosti++;
  if (latestReading.dim) nepravilnosti++;
  if (latestReading.baterija < 10) nepravilnosti++;

  return nepravilnosti;
}

// Funkcija za dohvaćanje adrese iz koordinata
async function fetchAddress(lat, lng) {
  if (!lat || !lng || lat === 0 || lng === 0) {
    console.warn('Nevažeće koordinate za dohvaćanje adrese:', lat, lng);
    return 'Adresa nije dostupna';
  }

  try {
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=AIzaSyBon6MM4Eszyv8o3MAaO0xYOHKZq1dcP1Y`);
    const data = await response.json();

    if (data.status === "OK" && data.results.length > 0) {
      return extractAddressDetails(data.results[0]);
    } else {
      console.warn('Adresa nije pronađena za dane koordinate:', lat, lng);
      return 'Adresa nije dostupna';
    }
  } catch (error) {
    console.error('Greška prilikom dohvaćanja adrese:', error);
    return 'Greška prilikom dohvaćanja adrese';
  }
}

// Funkcija za izdvajanje adrese
function extractAddressDetails(result) {
  const components = result.address_components;
  let streetNumber = '';
  let route = '';

  components.forEach(component => {
    if (component.types.includes("street_number")) {
      streetNumber = component.long_name;
    }
    if (component.types.includes("route")) {
      route = component.long_name;
    }
  });

  return `${route} ${streetNumber}`;
}

// Funkcija za dodavanje novih spremnika na popis
async function createBinDiv(bin) {
  const binDiv = document.createElement('div');
  const latestReading = bin.ocitanja[0] || {};

  binDiv.className = 'spremnik-item';
  binDiv.id = `bin-${bin.id}`;

  let napunjenostClass = '';
    if (latestReading.napunjenost >= 75) {
        napunjenostClass = 'red';
    } else if (latestReading.napunjenost > 50) {
        napunjenostClass = 'orange';
    } else {
        napunjenostClass = 'green';
    }

  // Provjera raznih stanja spremnika i dodavanje odgovarajućih klasa
  let isWarning = false;
  
  if (
    latestReading.polozaj ||
    latestReading.napunjenost >= 75 ||
    latestReading.temperatura >= 80 ||
    latestReading.plamen ||
    latestReading.dim ||
    latestReading.baterija < 10 ||
    (bin.initialLat && bin.initialLng && (bin.lat !== bin.initialLat || bin.lng !== bin.initialLng))
  ) {
    isWarning = true;
    binDiv.classList.add('warning');
  }

    binDiv.innerHTML = `
    <span class="col-naziv bold">${bin.naziv}</span>
    <span class="col-napunjenost ${napunjenostClass}">${latestReading.napunjenost !== undefined ? latestReading.napunjenost : 'N/A'}%</span>
    <span class="col-polozaj ${latestReading.polozaj ? 'highlight' : ''}">${latestReading.polozaj ? 'Prevrnut' : 'Ispravan'}</span>
    <span class="col-temperatura ${latestReading.temperatura > 80 ? 'highlight' : ''}">${latestReading.temperatura || 'N/A'}°C</span>
    <span class="col-plamen ${latestReading.plamen ? 'highlight blink-row' : ''}">${latestReading.plamen ? 'Da' : 'Ne'}</span>
    <span class="col-dim ${latestReading.dim ? 'highlight' : ''}">${latestReading.dim ? 'Da' : 'Ne'}</span>
    <span class="col-baterija ${latestReading.baterija < 10 ? 'highlight' : ''}">${latestReading.baterija || 'N/A'}%</span>
    <span class="col-adresa" data-full-address="${bin.address || 'N/A'}">${bin.address || 'N/A'}</span>
    <span class="col-podrucje">${bin.podrucje || 'N/A'}</span>
    <span class="col-vrsta">${bin.vrsta_otpad || 'N/A'}</span>
    <div class="col-akcije actions">
        <button class="update-btn" onclick='openUpdateForm(${bin.id})'>Uredi</button>
        <button class="delete-btn" onclick="deleteContainer(${bin.id}, this)">Obriši</button>
    </div>
`;

document.getElementById('spremnici-lista').appendChild(binDiv);

// Provjera širine teksta u elementu s klasom "col-adresa"
const locationSpan = binDiv.querySelector('.col-adresa');
if (locationSpan) {
    if (locationSpan.offsetWidth < locationSpan.scrollWidth) {
        locationSpan.setAttribute('data-full-address', locationSpan.textContent.trim());
    } else {
        locationSpan.removeAttribute('data-full-address');
    }
}

  return binDiv;
}

// Funkcija za rukovanje slanjem forme
function handleSubmit(event) {
  event.preventDefault();
  
  const id = document.getElementById('spremnik-id').value;
  const searchInputElement = document.getElementById('search-input');
  const searchTerm = searchInputElement ? searchInputElement.value.toLowerCase().trim() : '';
  if (id) {
    updateContainer(id, searchTerm);
  } else {
    submitNewContainer();
  }
}

// Funkcija za spremanje novog spremnika u bazu
async function submitNewContainer() {
  const spremnikData = getFormData();

  try {
    const address = (spremnikData.lat && spremnikData.lng && spremnikData.lat !== 0 && spremnikData.lng !== 0)
            ? await fetchAddress(spremnikData.lat, spremnikData.lng)
            : "Adresa nije dostupna";
        
    spremnikData.address = address;

    console.log('Slanje podataka:', spremnikData);

    const response = await fetch('/rest/spremnici', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(spremnikData)
    });

    if (!response.ok) {
      const errorData = await response.json();
      if (response.status === 400 && errorData.error) {
          alert('Greška: Spremnik s istim nazivom ili RFID-om već postoji.');
      } else {
          throw new Error(`Greška sa statusom: ${response.status}`);
      }
      return;
    }

    const responseData = await response.json();
    
    if (responseData.message === 'success' && responseData.data && responseData.data.id) {
      const newSpremnik = responseData.data;
      const newBinId = Number(newSpremnik.id);

      // Ažuriranje objekta bins
      mapFunctions.bins[newBinId] = {
        ...newSpremnik,
        ocitanja: newSpremnik.ocitanja || [], // Ako nema očitanja, postavite praznu listu
        nepravilnosti: calculateIrregularities(newSpremnik) // Izračun nepravilnosti
    };

      await refreshBinList();
      addBinToList(mapFunctions.bins[newBinId]);
      addMarker(mapFunctions.bins[newBinId]);
      checkFillLevels();
      toggleForm('dodaj-spremnik-form');
    } else {
      console.error('Error adding spremnik:', responseData);
    }
  } catch (error) {
    console.error('Error adding spremnik:', error);
    alert(`Došlo je do greške prilikom dodavanja spremnika: ${error.message}`);
  }
}

// Funkcija za ručno ažuriranje postojećeg spremnika
async function updateContainer(id) {
  const spremnikData = getFormData();

  // Funkcija za konvertiranje tipa podataka ocitanja
  function convertOcitanjaTypes(ocitanja) {
    return ocitanja.map(ocitanje => ({
        ...ocitanje,
        temperatura: parseFloat(ocitanje.temperatura),
        napunjenost: parseFloat(ocitanje.napunjenost),
        plamen: Boolean(ocitanje.plamen),
        polozaj: Boolean(ocitanje.polozaj),
        baterija: parseFloat(ocitanje.baterija),
        dim: Boolean(ocitanje.dim)
    }));
  }

  try {
      const response = await fetch(`/rest/spremnici/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(spremnikData)
      });
      const updatedSpremnik = await response.json();

      if (updatedSpremnik.message === 'success' && updatedSpremnik.data && updatedSpremnik.data.id) {
        const address = await fetchAddress(updatedSpremnik.data.lat, updatedSpremnik.data.lng);
        updatedSpremnik.data.address = address;
        
        const binId = parseInt(updatedSpremnik.data.id, 10);
        
        // Ažuriranje `bins` objekta s novim podacima
        mapFunctions.bins[binId] = {
          ...mapFunctions.bins[binId],
          ...updatedSpremnik.data,
          ocitanja: convertOcitanjaTypes(updatedSpremnik.data.ocitanja),
          nepravilnosti: calculateIrregularities(updatedSpremnik.data),
      };

        removeMarker(binId);
        addMarker(mapFunctions.bins[binId]);

        // Spremanje trenutnog stanja pretrage u local storage
        const searchInputElement = document.getElementById('pretraga-spremnika');
        const searchTerm = searchInputElement ? searchInputElement.value.toLowerCase().trim() : '';
        localStorage.setItem('currentSearchTerm', searchTerm);

        await refreshBinList(searchTerm);
        await checkFillLevels();      
        toggleForm('dodaj-spremnik-form');

      } else {
          console.error('Error updating spremnik:', updatedSpremnik);
          alert(`${updatedSpremnik.error}`);
      }
  } catch (error) {
      console.error('Error updating spremnik:', error);
  }
}

// Funkcija za dohvaćanje podataka u formu za ručno ažuriranje spremnnika
function getFormData() {
  return {
    naziv: document.getElementById('naziv').value,
    rfid: document.getElementById('rfid').value,
    lat: document.getElementById('lat').value,
    lng: document.getElementById('lng').value,
    volumen: document.getElementById('volumen').value,
    podrucje: document.getElementById('podrucje').value,
    vrsta_otpad: document.getElementById('vrsta').value,
    ocitanja: [{
      napunjenost: document.getElementById('napunjenost').value,
      temperatura: document.getElementById('temperatura').value,
      plamen: document.getElementById('plamen').value === 'true',
      polozaj: document.getElementById('polozaj').value === 'true',
      baterija: document.getElementById('baterija').value,
      dim: document.getElementById('dim').value === 'true',
      datetime: new Date().toISOString()
    }]
  };
}

// Funkcija za dodavanje spremnnika na popis
async function addBinToList(bin) {
  console.log('Dodavanje spremnika na listu:', bin);
  const existingBinDiv = document.getElementById(`bin-${bin.id}`);
  if (existingBinDiv) {
    existingBinDiv.remove();
  }

  const binDiv = await createBinDiv(bin);
  if (!binDiv) {
      console.error(`Greška prilikom kreiranja binDiv za spremnik ID: ${bin.id}`);
      return;
  }

  const container = document.getElementById('spremnici-lista');
  if (!container) {
      console.error('Nije pronađen element s ID-om "spremnici-lista"');
      return;
  }

  try {
      // Dohvaćanje adrese preko lat i lng
      const address = await fetchAddress(bin.lat, bin.lng);
      bin.address = address;

      // Ažuriranje binDiv s adresom
      const locationSpan = binDiv.querySelector('.col-adresa');
      if (locationSpan) {
          locationSpan.textContent = address;
      }
      
      // Provjera širine nakon što je element dodan u DOM
      container.appendChild(binDiv);
      console.log('Spremnik uspješno dodan na listu.');

  } catch (error) {
    console.error('Greška prilikom postavljanja adrese:', error);
  }
}

// Funkcija za ažuriranje popisa nakon ažuriranja pojedinačnog spremnika
async function updateBin(bin) {
  const binDiv = document.getElementById(`bin-${bin.id}`);
  if (binDiv) {
    const newBinDiv = await createBinDiv(bin);
    binDiv.replaceWith(newBinDiv);
  }

  // Provjera je li mapa inicijalizirana i dostupna
  const map = getMap();
  if (map) {
    removeMarker(bin.id);

    const icon = createMarkerIcon(bin.ocitanja[0] || {}); // Kreiraj ikonu za marker
    const marker = createMarker(bin, icon); // Koristi createMarker funkciju iz map.js

    marker.addTo(markerLayerGroup);
    bins[bin.id].marker = marker;

    // Dodavanje timeouta kako bi se osvježio prikaz karte nakon izmjena
    setTimeout(() => {
      map.invalidateSize();
      console.log(`Prikaz karte je osvježen nakon ažuriranja markera za bin ID: ${bin.id}`);
    }, 100); //
  } else {
    console.error('Mapa nije inicijalizirana.');
  }
}

// Funkcija za brisanje spremnika
window.deleteContainer = async function(id, deleteBtn) {
  console.log(`Brisanje spremnika s ID-jem: ${id}`);
  alert 
  const binDiv = deleteBtn.closest('.spremnik-item');
  const marker = mapFunctions.bins[id] ? mapFunctions.bins[id].marker : null;

  try {
    const confirmation = window.confirm('Jeste li sigurni da želite obrisati spremnik?');
        if (!confirmation) {
            return;
        }

    const response = await fetch(`/rest/spremnici/${id}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error(`Network response was not ok, status: ${response.status}`);
    }

    await response.json();
    console.log(`Spremnik s ID-jem ${id} uspješno obrisan.`);
    // Uklanjanje spremnika iz DOM-a i karte
    delete mapFunctions.bins[id];
    if (binDiv) {
      binDiv.remove(); // Uklanjanje cijele kartice iz DOM-a
    }
    if (marker) {
      getMap().removeLayer(marker); // Uklanjanje markera s karte
    }
  } catch (error) {
    console.error('Error deleting spremnik:', error);
  }
};

// Funkcija za provjeravanje očitanja i osvježavanje summary boxa
async function checkFillLevels() {
  let totalBins = 0;
  let bins75 = 0;
  let bins51to74 = 0;
  let bins0to50 = 0;
  let overturnedBins = 0;
  let highTempCount = 0;
  let fireDetected = 0;
  let smokeDetected = 0;
  let pozarCount = 0;

  let totalFill75 = 0;
  let totalFill51to74 = 0;
  let totalFill0to50 = 0;

  const EMAIL_INTERVAL = 60 * 60 * 1000; // 1 sat u milisekundama

  for (const bin of Object.values(mapFunctions.bins)) {
    if (!bin.ocitanja || bin.ocitanja.length === 0) {
      continue;
    }
    const latestReading = bin.ocitanja[0] || {};

    if (latestReading) {
      totalBins++;

      if (latestReading.napunjenost >= 75) {
        bins75++;
        totalFill75 += latestReading.napunjenost;
      } else if (latestReading.napunjenost > 50 && latestReading.napunjenost < 75) {
        bins51to74++;
        totalFill51to74 += latestReading.napunjenost;
      } else if (latestReading.napunjenost <= 50) {
        bins0to50++;
        totalFill0to50 += latestReading.napunjenost;
      }

      if (latestReading.polozaj) {
        overturnedBins++;
      }

      if (latestReading.temperatura > 80) {
        highTempCount++;
      }

      if (latestReading.plamen) {
        fireDetected++;
      }

      if (latestReading.dim) {
        smokeDetected++;
      }

      const binElement = document.getElementById(`bin-${bin.id}`);
      if (!binElement) continue;
      const isFireDetected = latestReading.temperatura > 80 && latestReading.plamen && latestReading.dim;

      if (isFireDetected) {
        pozarCount++;
        binElement.classList.add('blink-card');

      } else {
        binElement.classList.remove('blink-card');
        mapFunctions.bins[bin.id].emailSent = false; // Resetiranje statusa ako nema požara
      }
    }
  }

  const avgFill75 = bins75 ? (totalFill75 / bins75).toFixed(2) : '0';
  const avgFill51to74 = bins51to74 ? (totalFill51to74 / bins51to74).toFixed(2) : '0';
  const avgFill0to50 = bins0to50 ? (totalFill0to50 / bins0to50).toFixed(2) : '0';

  document.getElementById('total-bins-count').textContent = `Ukupno: ${totalBins}`;
  document.getElementById('overturned-bins-count').textContent = `Prevrnuto: ${overturnedBins}`;
  document.getElementById('high-temp-count').textContent = `Iznad 80°C: ${highTempCount}`;
  document.getElementById('fire-detected').textContent = `Plamen: ${fireDetected}`;
  document.getElementById('smoke-detected').textContent = `Dim: ${smokeDetected}`;
  document.getElementById('pozar').textContent = `Požar: ${pozarCount}`;
  document.getElementById('bins-75-count').textContent = `Ukupno: ${bins75}`;
  document.getElementById('avg-fill-75').textContent = `Prosječna napunjenost: ${avgFill75}%`;
  document.getElementById('bins-51-74-count').textContent = `Ukupno: ${bins51to74}`;
  document.getElementById('avg-fill-51-74').textContent = `Prosječna napunjenost: ${avgFill51to74}%`;
  document.getElementById('bins-0-50-count').textContent = `Ukupno: ${bins0to50}`;
  document.getElementById('avg-fill-0-50').textContent = `Prosječna napunjenost: ${avgFill0to50}%`;

  const pozarRow = document.getElementById('pozar');
  if (pozarCount > 0) {
    pozarRow.classList.add('blink-row');
  } else {
    pozarRow.classList.remove('blink-row');
  }

  const plamenRow = document.getElementById('fire-detected');
  if (fireDetected > 0) {
    plamenRow.classList.add('blink-row');
  } else {
    plamenRow.classList.remove('blink-row');
  }
}

