let users = [];

document.addEventListener('DOMContentLoaded', () => {
    loadUsers();
    loadSpremnici();

    // Postavljanje event listenera za dodavanje korisnika
    const addForm = document.getElementById('dodaj-korisnika-form');
    addForm.addEventListener('submit', handleSubmit);
    document.getElementById('dodaj-korisnika-btn').addEventListener('click', () => {
        clearForm(); // Čišćenje forme prije otvaranja
        loadSpremnici();
        toggleForm('dodaj-korisnika-form');
        toggleNewUser(true);

        // Postavljanje listenera za datum odjave
        addOdjavaListener();
    });
    document.getElementById('odustani').addEventListener('click', () => toggleForm('dodaj-korisnika-form'));

    // Event listener za pretraživanje
    const searchInput = document.getElementById('pretraga-korisnika');
    searchInput.addEventListener('input', handleSearch);

    // Automatsko postavljanje današnjeg datuma prilikom otvaranja forme
    const prijavaInput = document.getElementById('prijava');
    if (prijavaInput) {
        prijavaInput.value = new Date().toISOString().split('T')[0];
    }
});

// FORMATIRANJE HR DATUMA
function formatDateHR(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('hr-HR');
}

// UČITAVANJE KORISNIKA IZ BAZE
async function loadUsers() {
    try {
        const response = await fetch('/rest/korisnici');
        users = await response.json();
        //console.log("Loaded users: ", users); // Log za provjeru dobivenih podataka
        displayUsers(users);
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

// PRETRAŽIVANJE KORISNIKA
function handleSearch(event) {
    const searchTerm = event.target.value.toLowerCase().trim();

    // Ako je pretraga prazna, prikaži sve korisnike
    if (searchTerm === '') {
        displayUsers(users);
        return;
    }

    // Filtriraj korisnike prema unosu
    const filteredUsers = users.filter(user => {
        const spremniciNazivi = user.spremnici
            ? user.spremnici.map(spremnik => spremnik.naziv.toLowerCase()).join(' ')
            : '';
        const podrucjaNazivi = user.spremnici
            ? user.spremnici.map(spremnik => spremnik.podrucje.toLowerCase()).join(' ')
            : '';
        return (
            user.ime.toLowerCase().includes(searchTerm) ||
            user.prezime.toLowerCase().includes(searchTerm) ||
            user.email.toLowerCase().includes(searchTerm) ||
            user.telefon.toLowerCase().includes(searchTerm) ||
            user.ulica.toLowerCase().includes(searchTerm) ||
            user.broj.toLowerCase().includes(searchTerm) ||
            user.grad.toLowerCase().includes(searchTerm) ||
            spremniciNazivi.includes(searchTerm) ||
            podrucjaNazivi.includes(searchTerm)
        );
    });

    displayUsers(filteredUsers);
}

// UČITAVANJE DOSTUPNIH SPREMNIKA
async function loadSpremnici(selectedSpremnici = []) {
    try {
        // Dohvaćanje svih korisnika s njihovim dodijeljenim spremnicima
        const usersResponse = await fetch('/rest/korisnici');
        const users = await usersResponse.json();

        // Dohvaćanje ID-ijeva svih dodijeljenih spremnika
        const dodijeljeniSpremnici = new Set();
        users.forEach(user => {
            user.spremnici.forEach(spremnik => {
                dodijeljeniSpremnici.add(spremnik.id);
            });
        });

        // Dohvaćanje svih spremnika iz baze
        const spremniciResponse = await fetch('/rest/spremnici');
        const sviSpremnici = await spremniciResponse.json();

        const dostupniSpremniciLista = document.getElementById('dostupni-spremnici-lista');
        if(dostupniSpremniciLista){
            dostupniSpremniciLista.innerHTML = ''; // Očisti trenutni sadržaj

            let brojDostupnihSpremnika = 0;

            // Prikaz samo onih spremnika koji nisu dodijeljeni drugom korisniku
            sviSpremnici.forEach(spremnik => {
                if (!dodijeljeniSpremnici.has(spremnik.id) || selectedSpremnici.includes(spremnik.id)) {
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.value = spremnik.id;
                    checkbox.id = `spremnik-${spremnik.id}`;
                    checkbox.name = 'spremnici';
                    checkbox.checked = selectedSpremnici.includes(spremnik.id);

                    const label = document.createElement('label');
                    label.htmlFor = `spremnik-${spremnik.id}`;
                    label.textContent = spremnik.naziv;

                    const container = document.createElement('div');
                    container.appendChild(checkbox);
                    container.appendChild(label);

                    dostupniSpremniciLista.appendChild(container);
                    brojDostupnihSpremnika++;
                }
            });

            // Ako nema dostupnih spremnika, prikaži poruku
            if (brojDostupnihSpremnika === 0) {
                const poruka = document.createElement('p');
                poruka.textContent = 'Nema dostupnih spremnika.';
                dostupniSpremniciLista.appendChild(poruka);
            }
        }
    } catch (error) {
        console.error('Error loading available bins:', error);
    }
}

// UČITAVANJE SPREMNIKA POVEZANIH S KORISNIKOM
async function loadUserSpremnici(userId, container) {
    try {
        const response = await fetch(`/rest/korisnici/${userId}`);
        const data = await response.json();

        if (!container) {
            console.error(`Element za spremnike korisnika s ID-jem ${userId} nije pronađen.`);
            return;
        }

        //console.log(`Loading bins for user ${userId}:`, data.data.spremnici);
        
        container.innerHTML = '';

        if (data.message === 'success' && data.data.spremnici) {
            data.data.spremnici.forEach(spremnik => {
                const spremnikDiv = document.createElement('div');
                spremnikDiv.className = 'spremnik-item';
                spremnikDiv.textContent = spremnik.naziv;
                container.appendChild(spremnikDiv);
            });
        }
    } catch (error) {
        console.error('Error loading user\'s bins:', error);
    }
}

// DODAVANJE LISTENERA ZA ODJAVU KORISNIKA
function addOdjavaListener() {
    const odjavaCheckbox = document.getElementById('odjava');
    if (odjavaCheckbox) {
        // Uklanjanje postojećeg listenera ako postoji
        const newCheckbox = odjavaCheckbox.cloneNode(true);
        odjavaCheckbox.parentNode.replaceChild(newCheckbox, odjavaCheckbox);

        newCheckbox.addEventListener('change', function(event) {
            if (event.target.checked) {
                // Prikaz poruke samo ako je korisnik označio odjavu
                const confirmation = window.confirm('Jeste li sigurni da želite odjaviti korisnika? Dodijeljeni spremnici će se ukloniti.');
                if (!confirmation) {
                    event.target.checked = false; // Poništavanje promjene ako korisnik odustane
                } else {
                    // Ako korisnik potvrdi odjavu, čišćenje svih spremnika
                    const checkboxes = document.querySelectorAll('input[name="spremnici"]');
                    checkboxes.forEach(checkbox => checkbox.checked = false);
                }
            } else {
                // Prikazivanje poruke samo ako korisnik poništava odjavu (želi ponovno prijaviti korisnika)
                const confirmation = window.confirm('Želite li ponovno prijaviti korisnika?');
                if (!confirmation) {
                    event.target.checked = true; // Poništavanje promjene ako korisnik odustane
                }
            }
        });
    }
}

// PRIKAZ KORISNIKA NA STRANICI
function displayUsers(usersToDisplay) {
    const usersList = document.getElementById('korisnici-lista');
    usersList.innerHTML = '';

    // Dodavanje zaglavlja
    const headerDiv = document.createElement('div');
    headerDiv.className = 'korisnik-red korisnik-zaglavlje';
    headerDiv.innerHTML = `
        <div class="korisnik-stupac col-ime">Ime i Prezime</div>
        <div class="korisnik-stupac col-email">Email</div>
        <div class="korisnik-stupac col-telefon">Telefon</div>
        <div class="korisnik-stupac col-adresa">Adresa</div>
        <div class="korisnik-stupac col-grad">Grad</div>
        <div class="korisnik-stupac col-registracija">Datum Registracije</div>
        <div class="korisnik-stupac col-odjava">Datum Odjave</div>
        <div class="korisnik-stupac col-spremnici">Spremnici</div>
        <div class="korisnik-stupac col-podrucje">Područje</div>
        <div class="korisnik-stupac col-akcije"></div>
    `;
    usersList.appendChild(headerDiv);

    // Prikaz korisnika u listi
    usersToDisplay.forEach(user => {
        const userDiv = document.createElement('div');
        userDiv.className = 'korisnik-red korisnik-podaci';

        const spremniciNazivi = user.spremnici
            .map(spremnik => `<div>${spremnik.naziv}</div>`)
            .join('');
        const podrucjaNazivi = user.spremnici
            .map(spremnik => `<div>${spremnik.podrucje}</div>`)
            .join('');

        userDiv.innerHTML = `
            <div class="korisnik-stupac col-ime bold">${user.ime} ${user.prezime}</div>
            <div class="korisnik-stupac col-email">${user.email}</div>
            <div class="korisnik-stupac col-telefon">${user.telefon}</div>
            <div class="korisnik-stupac col-adresa">${user.ulica} ${user.broj}</div>
            <div class="korisnik-stupac col-grad">${user.grad}</div>
            <div class="korisnik-stupac col-registracija">${formatDateHR(user.datum_registracije)}</div>
            <div class="korisnik-stupac col-odjava">${user.datum_odjave ? formatDateHR(user.datum_odjave) : ''}</div>
            <div class="korisnik-stupac col-spremnici">${spremniciNazivi}</div>
            <div class="korisnik-stupac col-podrucje">${podrucjaNazivi}</div>
            <div class="korisnik-stupac col-akcije">
                <button class="update-btn" onclick='openUpdateForm(${JSON.stringify(user)})'>Uredi</button>
                <button class="delete-btn" onclick="deleteUser(${user.id}, this)">Obriši</button>
            </div>
        `;
        usersList.appendChild(userDiv);
    });
}

// OTVARANJE I ZATVARANJE FORME
function toggleForm(formId) {
    const form = document.getElementById(formId);
    form.style.display = form.style.display === 'block' ? 'none' : 'block';
}

// POSTAVLJANJE FORME ZA NOVOG KORISNIKA
function toggleNewUser(isNewUser) {
    const odjavaContainer = document.getElementById('odjava-container');
    odjavaContainer.style.display = isNewUser ? 'none' : 'block';
}

// OBRADA FORME ZA DODAVANJE/AŽURIRANJE KORISNIKA
function handleSubmit(event) {
    event.preventDefault();
    const id = document.getElementById('korisnik-id').value;
    const isOdjava = document.getElementById('odjava').checked;
    if (id) {
        updateUser(id);
    } else {
        submitNewUser();
    }
}

// SLANJE ZAHTJEVA ZA DODAVANJE NOVOG KORISNIKA
async function submitNewUser() {
    const userData = getFormData();

    try {
        const response = await fetch('/rest/korisnici', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });

        const responseData = await response.json();

        if (response.status === 409) {
            console.error('Error adding user:', responseData);
            alert(responseData.error); // Prikazivanje poruke o grešci korisniku
        } else if (response.status === 200 && responseData.message === "Korisnik uspješno dodan") {
            await loadUsers(); // Ponovno učitavanje korisnika iz baze nakon dodavanja novog korisnika
            toggleForm('dodaj-korisnika-form');
        } else {
            console.error('Unexpected response:', responseData);
            alert('Došlo je do neočekivane greške prilikom dodavanja korisnika.');
        }
    } catch (error) {
        console.error('Error adding user:', error);
        alert('Došlo je do greške prilikom dodavanja korisnika.');
    }
}

// ČIŠĆENJE FORME
function clearForm() {
    document.getElementById('korisnik-id').value = '';
    document.getElementById('ime').value = '';
    document.getElementById('prezime').value = '';
    document.getElementById('ulica').value = '';
    document.getElementById('broj').value = '';
    document.getElementById('grad').value = '';
    document.getElementById('email').value = '';
    document.getElementById('telefon').value = '';
    document.getElementById('odjava').value = '';
}

// OTVARANJE FORME ZA AŽURIRANJE KORISNIKA
async function openUpdateForm(user) {
    const form = document.getElementById('dodaj-korisnika-form');
    document.getElementById('korisnik-id').value = user.id;
    document.getElementById('ime').value = user.ime;
    document.getElementById('prezime').value = user.prezime;
    document.getElementById('ulica').value = user.ulica;
    document.getElementById('broj').value = user.broj;
    document.getElementById('grad').value = user.grad;
    document.getElementById('email').value = user.email;
    document.getElementById('telefon').value = user.telefon;
    document.getElementById('odjava').checked = !!user.datum_odjave;

    try {
        // Dohvaćamo sve korisnike i njihove spremnike
        const usersResponse = await fetch('/rest/korisnici');
        const allUsers = await usersResponse.json();

        // Dohvaćamo sve dodijeljene spremnike
        const dodijeljeniSpremnici = new Set();
        allUsers.forEach(existingUser => {
            existingUser.spremnici.forEach(spremnik => {
                dodijeljeniSpremnici.add(spremnik.id);
            });
        });

        // Dohvaćamo sve spremnike iz baze
        const responseSpremnici = await fetch('/rest/spremnici');
        const sviSpremnici = await responseSpremnici.json();

        const dodijeljeniSpremniciKorisniku = user.spremnici.map(spremnik => spremnik.id);

        // Prikaz dostupnih spremnika u multiselectu
        const dostupniSpremniciLista = document.getElementById('dostupni-spremnici-lista');
        if (dostupniSpremniciLista) { 
            dostupniSpremniciLista.innerHTML = '';

            let brojDostupnihSpremnika = 0;

            sviSpremnici.forEach(spremnik => {
                const isDodijeljenDrugomKorisniku = dodijeljeniSpremnici.has(spremnik.id) && !dodijeljeniSpremniciKorisniku.includes(spremnik.id);

                if (!isDodijeljenDrugomKorisniku) {
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.value = spremnik.id;
                    checkbox.id = `spremnik-${spremnik.id}`;
                    checkbox.name = 'spremnici';
                    checkbox.checked = dodijeljeniSpremniciKorisniku.includes(spremnik.id);

                    const label = document.createElement('label');
                    label.htmlFor = `spremnik-${spremnik.id}`;
                    label.textContent = spremnik.naziv;

                    const container = document.createElement('div');
                    container.appendChild(checkbox);
                    container.appendChild(label);

                    dostupniSpremniciLista.appendChild(container);
                    brojDostupnihSpremnika++;
                }
            });
            // Ako nema dostupnih spremnika, prikaži poruku
            if (brojDostupnihSpremnika === 0) {
                const poruka = document.createElement('p');
                poruka.textContent = 'Nema dostupnih spremnika.';
                dostupniSpremniciLista.appendChild(poruka);
            }
        }
    } catch (error) {
        console.error('Error loading user\'s bin:', error);
    }

    form.style.display = 'block';
    toggleNewUser(false);
    addOdjavaListener();
}

// AŽURIRANJE POSTOJEĆEG KORISNIKA
async function updateUser(id) {
    const userData = getFormData();
    const odjavaCheckbox = document.getElementById('odjava');

    // Provjera statusa checkboxa za odjavu
    if (odjavaCheckbox.checked) {
        // Ako je checkbox označen, postavlja se trenutni datum kao datum odjave
        userData.datum_odjave = new Date().toISOString().split('T')[0];
        userData.spremnici = [];
    } else {
        // Ako checkbox nije označen, uklanja se datum odjave
        userData.datum_odjave = null;
    }

    try {
        const response = await fetch(`/rest/korisnici/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });

        const updatedUser = await response.json();

        // Provjera uspješnosti odgovora
        if (response.ok) {
            console.log('User updated successfully:', updatedUser);
            await loadUsers();
            toggleForm('dodaj-korisnika-form');
        } else {
            console.error('Error updating user:', updatedUser);
            // Prikaz poruke o grešci korisniku
            alert(`Error: ${updatedUser.error || 'Nešto je pošlo po zlu prilikom ažuriranja korisnika.'}`);
        }
    } catch (error) {
        console.error('Error updating user:', error);
        // Prikaz poruke o grešci korisniku
        alert(`Error: ${error.message || 'Nešto je pošlo po zlu prilikom ažuriranja korisnika.'}`);
    }
}

// DOHVAĆANJE PODATAKA IZ FORME
function getFormData() {
    const checkboxes = document.querySelectorAll('input[name="spremnici"]:checked');
    const selectedSpremnici = Array.from(checkboxes).map(checkbox => checkbox.value);
    return {
        ime: document.getElementById('ime').value,
        prezime: document.getElementById('prezime').value,
        ulica: document.getElementById('ulica').value,
        broj: document.getElementById('broj').value,
        grad: document.getElementById('grad').value,
        email: document.getElementById('email').value,
        telefon: document.getElementById('telefon').value,
        spremnici: selectedSpremnici,
        datum_odjave: document.getElementById('odjava').checked ? new Date().toISOString() : null
    };
}

// DODAVANJE KORISNIKA U LISTU
function addUserToList(user) {
    const usersList = document.getElementById('korisnici-lista');
    const userDiv = createUserDiv(user);
    usersList.appendChild(userDiv);
}

// AŽURIRANJE KORISNIKA U LISTI
function updateUserInList(user) {
    const userDiv = document.getElementById(`user-${user.id}`);
    if (userDiv) {
        const newUserDiv = createUserDiv(user);
        userDiv.replaceWith(newUserDiv);
    }
}

// KREIRANJE HTML ELEMENATA ZA NOVOG KORISNIKA
function createUserDiv(user) {
    const userDiv = document.createElement('div');
    userDiv.className = 'korisnik-item';
    userDiv.id = `user-${user.id}`;
    userDiv.innerHTML = `
        <span class="bold">${user.ime} ${user.prezime}</span>
        <span>Email: ${user.email}</span>
        <span>Ulica: ${user.ulica}, ${user.grad}</span>
        <span>Spremnik: ${user.spremnik_naziv}</span>
        <div>
            <button class="update-btn" onclick='openUpdateForm(${JSON.stringify(user)})'>Uredi</button>
            <button class="delete-btn" onclick="deleteUser(${user.id}, this)">Obriši</button>
        </div>
    `;
    return userDiv;
}

// BRISANJE KORISNIKA
async function deleteUser(id, deleteBtn) {
    try {
        // Potvrda prije brisanja
        const confirmation = window.confirm('Jeste li sigurni da želite obrisati ovog korisnika?');
        if (!confirmation) {
            // Ako korisnik klikne "Odustani", prekida se brisanje
            return;
        }

        const response = await fetch(`/rest/korisnici/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error(`Network response was not ok, status: ${response.status}`);
        }

        await response.json();
        console.log(`Korisnik s ID-jem ${id} uspješno obrisan.`);

        const userDiv = deleteBtn.closest('.korisnik-red');
        if (userDiv) {
            userDiv.remove();
        }
    } catch (error) {
        console.error('Error deleting user:', error);
    }
}
