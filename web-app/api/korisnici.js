const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { sendEmailNotification } = require('./obavijesti');

// API rute za tablicu 'korisnici'

// Dodavanje novog korisnika ili dodavanje spremnika postojećem korisniku
router.post("/", async (req, res) => {
    const { ime, prezime, ulica, broj, grad, email, telefon, spremnici } = req.body;
    const datumRegistracije = new Date();

    try {
        // Provjera postoji li već e-mail
        const emailCheck = await new Promise((resolve, reject) => {
            db.get("SELECT id FROM korisnici WHERE email = ?", [email], (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });

        if (emailCheck) {
            return res.status(409).json({ error: 'Email adresa je već u upotrebi.' });
        }

        // Dodavanje novog korisnika unutar transakcije
        await new Promise((resolve, reject) => db.run("BEGIN TRANSACTION", err => err ? reject(err) : resolve()));

         // Provjera je li spremnik već dodijeljen
         if (Array.isArray(spremnici) && spremnici.length > 0) {
            for (const spremnik_id of spremnici) {
                const spremnikCheck = await new Promise((resolve, reject) => {
                    db.get("SELECT korisnik_id FROM korisnik_spremnici WHERE spremnik_id = ?", [spremnik_id], (err, row) => {
                        if (err) return reject(err);
                        resolve(row);
                    });
                });

                if (spremnikCheck) {
                    await new Promise((resolve, reject) => db.run("ROLLBACK", err => err ? reject(err) : resolve()));
                    return res.status(409).json({ error: `Spremnik ${spremnik_id} je već dodijeljen drugom korisniku.` });
                }
            }
        }

        // Dodavanje novog korisnika
        const korisnikId = await new Promise((resolve, reject) => {
            db.run(
                "INSERT INTO korisnici (ime, prezime, ulica, broj, grad, email, telefon, datum_registracije) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                [ime, prezime, ulica, broj, grad, email, telefon, datumRegistracije.toISOString()],
                function(err) {
                    if (err) {
                        db.run("ROLLBACK", rollbackErr => reject(err || rollbackErr));
                        return;
                    }
                    resolve(this.lastID);
                }
            );
        });

        // Dodjela jednog ili više spremnika korisniku
        if (Array.isArray(spremnici) && spremnici.length > 0) {
            const insertPromises = spremnici.map(spremnik_id => {
                return new Promise((resolve, reject) => {
                    db.run("INSERT INTO korisnik_spremnici (korisnik_id, spremnik_id) VALUES (?, ?)", [korisnikId, spremnik_id], function(err) {
                        if (err) {
                            db.run("ROLLBACK", rollbackErr => reject(err || rollbackErr));
                            return;
                        }
                        resolve();
                    });
                });
            });
            await Promise.all(insertPromises);

            // Informacije o dodijeljenim spremnicima
            const dodijeljeniSpremnici = await new Promise((resolve, reject) => {
                db.all(
                    "SELECT naziv FROM spremnici WHERE id IN (" + spremnici.map(() => '?').join(',') + ")",
                    spremnici,
                    (err, rows) => {
                        if (err) return reject(err);
                        resolve(rows);
                    }
                );
            });

            const spremniciNazivi = dodijeljeniSpremnici.map(spremnik => spremnik.naziv).join(', ');

            // Slanje e-mail obavijesti s informacijama o dodijeljenim spremnicima
            sendEmailNotification(
                email,
                'Dobrodošli!',
                `Poštovani/poštovana,\n\nOvaj mail potvrđuje da ste uspješno registrirani u sustav pametnog upravljanja otpadom.\n\nDodijeljeni spremnici: ${spremniciNazivi}\n\nGradsko komunalno`
            );
        } else {
            // Ako nema dodijeljenih spremnika, šalje se osnovni email
            sendEmailNotification(
                email,
                'Dobrodošli!',
                `Poštovani/poštovana ${ime} ${prezime},\n\nOvaj mail potvrđuje da ste uspješno registrirani u sustav pametnog upravljanja otpadom.\n\nGradsko komunalno`
            );
        }

        await new Promise((resolve, reject) => db.run("COMMIT", err => err ? reject(err) : resolve()));

        res.json({ message: "Korisnik uspješno dodan", data: { id: korisnikId } });
    } catch (err) {
        console.error("Error: ", err.message);
        res.status(500).json({ error: err.message });
    }
});


// Ažuriranje korisnika
router.put("/:id", async (req, res) => {
    const { ime, prezime, ulica, broj, grad, email, telefon, datum_odjave, spremnici } = req.body;
    const id = req.params.id;
    const datumOdjave = datum_odjave ? new Date(datum_odjave).toISOString().split('T')[0] : null;
    
    try {
        const existingUser = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM korisnici WHERE id = ?", [id], (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });

        if (!existingUser) {
            return res.status(404).json({ error: 'Korisnik nije pronađen.' });
        }

        if (email !== existingUser.email) {
            const emailExists = await new Promise((resolve, reject) => {
                db.get("SELECT id FROM korisnici WHERE email = ? AND id != ?", [email, id], (err, row) => {
                    if (err) return reject(err);
                    resolve(row);
                });
            });
            if (emailExists) {
                return res.status(409).json({ error: 'Email adresa se već koristi.' });
            }
        }

        // Dohvaćanje trenutnih spremnika korisnika
        const currentSpremnici = await new Promise((resolve, reject) => {
            db.all("SELECT spremnik_id FROM korisnik_spremnici WHERE korisnik_id = ?", [id], (err, rows) => {
                if (err) return reject(err);
                resolve(rows.map(row => row.spremnik_id));
            });
        });

        // Provjera je li spremnik već dodijeljen
        if (Array.isArray(spremnici) && spremnici.length > 0) {
            for (const spremnik_id of spremnici) {
                const spremnikCheck = await new Promise((resolve, reject) => {
                    db.get("SELECT korisnik_id FROM korisnik_spremnici WHERE spremnik_id = ? AND korisnik_id != ?", [spremnik_id, id], (err, row) => {
                        if (err) return reject(err);
                        resolve(row);
                    });
                });

                if (spremnikCheck) {
                    return res.status(409).json({ error: `Spremnik ${spremnik_id} je već dodijeljen drugom korisniku.` });
                }
            }
        }

        let changes = [];
        if (ime !== existingUser.ime) changes.push(`Ime: ${existingUser.ime} → ${ime}`);
        if (prezime !== existingUser.prezime) changes.push(`Prezime: ${existingUser.prezime} → ${prezime}`);
        if (`${ulica} ${broj}` !== `${existingUser.ulica} ${existingUser.broj}`) {
            changes.push(`Ulica i broj: ${existingUser.ulica} ${existingUser.broj} → ${ulica} ${broj}`);
        }
        if (grad !== existingUser.grad) changes.push(`Grad: ${existingUser.grad} → ${grad}`);
        if (telefon !== existingUser.telefon) changes.push(`Telefon: ${existingUser.telefon} → ${telefon}`);
        if (datumOdjave) {
            // Ako je datum odjave postavljen, korisnik je odjavljen
            if (datumOdjave !== existingUser.datum_odjave) {
                changes.push(`Datum odjave: ${datumOdjave}`);
            }
        } else if (existingUser.datum_odjave) {
            // Ako je datum odjave uklonjen, korisnik je ponovno prijavljen
            changes.push(`Ponovno ste prijavljeni u sustav pametnog upravljanja otpadom`);
        }

        await new Promise((resolve, reject) => {
            db.run(
                "UPDATE korisnici SET ime = ?, prezime = ?, ulica = ?, broj = ?, grad = ?, email = ?, telefon = ?, datum_odjave = ? WHERE id = ?",
                [ime, prezime, ulica, broj, grad, email, telefon, datumOdjave, id],
                function(err) {
                    if (err) return reject(err);
                    resolve();
                }
            );
        });

        // Pretvaranje string ID-ijeva u brojčane ID-ijeve
        const numericCurrentSpremnici = currentSpremnici.map(id => parseInt(id, 10));
        const numericNewSpremnici = spremnici.map(id => parseInt(id, 10));

        // Uspoređivanje spremnika i dodavanje promjene u listu
        const removedSpremnici = numericCurrentSpremnici.filter(id => !numericNewSpremnici.includes(id));
        const addedSpremnici = numericNewSpremnici.filter(id => !numericCurrentSpremnici.includes(id));

        // Dohvaćanje naziva dodanih i uklonjenih spremnika
        let removedSpremniciNazivi = [];
        if (removedSpremnici.length > 0) {
            removedSpremniciNazivi = await new Promise((resolve, reject) => {
                db.all(
                    "SELECT naziv FROM spremnici WHERE id IN (" + removedSpremnici.map(() => '?').join(',') + ")",
                    removedSpremnici,
                    (err, rows) => {
                        if (err) return reject(err);
                        resolve(rows.map(row => row.naziv));
                    }
                );
            });
        }

        let addedSpremniciNazivi = [];
        if (addedSpremnici.length > 0) {
            addedSpremniciNazivi = await new Promise((resolve, reject) => {
                db.all(
                    "SELECT naziv FROM spremnici WHERE id IN (" + addedSpremnici.map(() => '?').join(',') + ")",
                    addedSpremnici,
                    (err, rows) => {
                        if (err) return reject(err);
                        resolve(rows.map(row => row.naziv));
                    }
                );
            });
        }

        // Ako je bilo promjena u spremnicima, dodavanje u promjene
        if (removedSpremniciNazivi.length > 0) {
            changes.push(`Spremnici - uklonjeni:\n${removedSpremniciNazivi.join('\n')}`);
        }
        if (addedSpremniciNazivi.length > 0) {
            changes.push(`Spremnici - dodani:\n${addedSpremniciNazivi.join('\n')}`);
        }

        // Ako ima promjena, ažuriranje spremnika
        if (removedSpremnici.length > 0 || addedSpremnici.length > 0) {
            await new Promise((resolve, reject) => {
                db.run("DELETE FROM korisnik_spremnici WHERE korisnik_id = ?", [id], function(err) {
                    if (err) return reject(err);
                    resolve();
                });
            });

            const insertPromises = spremnici.map(spremnik_id => {
                return new Promise((resolve, reject) => {
                    db.run("INSERT INTO korisnik_spremnici (korisnik_id, spremnik_id) VALUES (?, ?)", [id, spremnik_id], function(err) {
                        if (err) return reject(err);
                        resolve();
                    });
                });
            });
            await Promise.all(insertPromises);
        }

        // Slanje emaila nakon odjave korisnika
        if (datum_odjave) {
            sendEmailNotification(
                email,
                'Odjava korisnika',
                `Poštovani/poštovana,\n\nOdjavljeni ste iz sustava pametnog upravljanja otpadom. Za ponovnu prijavu obratite se na email gradskokomunalno@gmail.com. Hvala što koristite naše usluge.\n\nUklonjeni spremnici: ${removedSpremniciNazivi.join(', ')}\n\nGradsko komunalno.`
            );
        } else if (changes.length > 0) {
            // Slanje emaila o promjenama (samo ako korisnik nije odjavljen)
            const changesText = changes.join('\n');
            sendEmailNotification(
                email,
                'Promjene na korisničkom računu',
                `Poštovani/poštovana,\n\nIzvršene su promjene na vašem korisničkom računu:\n\n${changesText}.\n\nGradsko komunalno`
            );
        }

        res.json({ message: "Korisnik uspješno ažuriran", data: { id, ime, prezime, ulica, broj, grad, email, telefon, datum_odjave: datumOdjave, spremnici } });
    } catch (err) {
        console.error("Error: ", err.message);
        res.status(500).json({ error: err.message });
    }
});


// Dohvaćanje svih korisnika s njihovim spremnicima
router.get("/", async (req, res) => {
    try {
        // Dohvaćanje svih korisnika
        const users = await new Promise((resolve, reject) => {
            db.all("SELECT * FROM korisnici", (err, rows) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });

        // Dohvaćanje spremnika za korisnika
        for (let user of users) {
            const spremnici = await new Promise((resolve, reject) => {
                db.all(
                    "SELECT spremnici.* FROM spremnici JOIN korisnik_spremnici ON spremnici.id = korisnik_spremnici.spremnik_id WHERE korisnik_spremnici.korisnik_id = ?",
                    [user.id],
                    (err, rows) => {
                        if (err) return reject(err);
                        resolve(rows);
                    }
                );
            });
            // Dodavanje spremnika korisnicima
            user.spremnici = spremnici;
        }

        res.json(users);
    } catch (err) {
        console.error("Database error: ", err.message);
        res.status(500).json({ error: err.message });
    }
});


// Dohvaćanje spremnika za pojedinog korisnika
router.get("/:id", async (req, res) => {
    try {
        const korisnik = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM korisnici WHERE id = ?", [req.params.id], (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });

        if (!korisnik) {
            return res.status(404).json({ error: 'Korisnik nije pronađen.' });
        }

        const spremnici = await new Promise((resolve, reject) => {
            db.all(
                `SELECT spremnici.*, spremnici.podrucje FROM spremnici
                 JOIN korisnik_spremnici ON spremnici.id = korisnik_spremnici.spremnik_id
                 WHERE korisnik_spremnici.korisnik_id = ?`,
                [req.params.id],
                (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows);
                }
            );
        });

        res.json({
            message: "success",
            data: { korisnik, spremnici }
        });
    } catch (err) {
        console.error("Database error: ", err.message);
        res.status(500).json({ error: err.message });
    }
});


// Brisanje korisnika
router.delete("/:id", async (req, res) => {
    try {
        // Dohvaćanje korisnika prije brisanja
        const korisnik = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM korisnici WHERE id = ?", [req.params.id], (err, row) => {
                if (err) return reject(err);
                resolve(row);
            });
        });

        if (!korisnik) {
            return res.status(404).json({ error: 'Korisnik nije pronađen.' });
        }

        // Dohvaćanje naziva spremnika koji će biti uklonjeni
        const spremniciZaUklanjanje = await new Promise((resolve, reject) => {
            db.all(
                "SELECT naziv FROM spremnici WHERE id IN (SELECT spremnik_id FROM korisnik_spremnici WHERE korisnik_id = ?)",
                [req.params.id],
                (err, rows) => {
                    if (err) return reject(err);
                    resolve(rows);
                }
            );
        });

        const spremniciNaziviZaUklanjanje = spremniciZaUklanjanje.map(spremnik => spremnik.naziv).join(', ');

        // Brisanje veza iz tablice korisnik_spremnici
        await new Promise((resolve, reject) => {
            db.run("DELETE FROM korisnik_spremnici WHERE korisnik_id = ?", [req.params.id], function(err) {
                if (err) return reject(err);
                resolve();
            });
        });

        // Brisanje korisnika
        await new Promise((resolve, reject) => {
            db.run("DELETE FROM korisnici WHERE id = ?", [req.params.id], function(err) {
                if (err) return reject(err);
                resolve();
            });
        });

        // Slanje emaila o brisanju korisnika
        sendEmailNotification(
            korisnik.email,
            'Brisanje korisničkog računa',
            `Poštovani/poštovana,\n\nVaš korisnički račun je uspješno izbrisan. Hvala što ste koristili uslugu pametnog upravljanja otpadom.\n\nUklonjeni spremnici: ${spremniciNaziviZaUklanjanje}\n\nGradsko komunalno`
        );

        res.json({ message: "success", data: { id: req.params.id } });
    } catch (err) {
        console.error("Error deleting user: ", err.message);
        res.status(500).json({ error: err.message });
    }
});


module.exports = router;