const express = require("express");
const router = express.Router();
const db = require('../config/db');
const { sendEmailNotification } = require('./obavijesti');

router.use(express.json());

// Dohvaćanje jednog spremnika prema ID-iju
router.get("/spremnici/:id", (req, res) => {
    const spremnikId = req.params.id;

    // Prvo dohvaćanje spremnika
    const spremnikQuery = "SELECT * FROM spremnici WHERE id = ?";
    db.get(spremnikQuery, [spremnikId], (err, spremnik) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }

        if (!spremnik) {
            res.status(404).json({ error: "Spremnik nije pronađen" });
            return;
        }

        // Ako je spremnik pronađen, dohvaćamo njegova očitanja
        const ocitanjaQuery = "SELECT * FROM ocitanja WHERE spremnik_id = ? ORDER BY datetime DESC";
        db.all(ocitanjaQuery, [spremnikId], (err, ocitanja) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }

            // Kombinacija spremnika i očitanja u jedan objekt
            const response = {
                ...spremnik, // širenje podataka spremnika
                ocitanja // dodavanje očitanja kao polje unutar odgovora
            };

            res.json({
                message: "success",
                data: response
            });
        });
    });
});


// Dohvaćanje sortiranih spremnika
router.get('/spremnici', async (req, res) => {
    try {
        const query = `
            SELECT s.id, s.naziv, s.rfid, s.lat, s.lng, s.volumen, s.podrucje, s.vrsta_otpad, 
                o.napunjenost, o.dim, o.plamen, o.polozaj, o.temperatura, o.baterija
            FROM spremnici s
            LEFT JOIN (
                SELECT spremnik_id, napunjenost, dim, plamen, polozaj, temperatura, baterija
                FROM ocitanja o
                WHERE datetime = (SELECT MAX(datetime) FROM ocitanja WHERE spremnik_id = o.spremnik_id)
            ) o ON s.id = o.spremnik_id
            ORDER BY
                (CASE WHEN o.dim = 1 THEN 1 ELSE 0 END +
                CASE WHEN o.plamen = 1 THEN 1 ELSE 0 END +
                CASE WHEN o.polozaj = 1 THEN 1 ELSE 0 END +
                CASE WHEN o.temperatura > 80 THEN 1 ELSE 0 END +
                CASE WHEN o.napunjenost >= 75 THEN 1 ELSE 0 END) DESC,
                o.napunjenost DESC
        `;
        db.all(query, [], (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json(rows);
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch bins' });
    }
});

// Dodavanje novog spremnika
router.post("/spremnici", (req, res) => {
    const { naziv, rfid, lat, lng, ocitanja, podrucje, volumen, vrsta_otpad } = req.body;
    
    db.run("INSERT INTO spremnici (naziv, rfid, lat, lng, podrucje, volumen, vrsta_otpad) VALUES (?, ?, ?, ?, ?, ?, ?)", [naziv, rfid, lat, lng, podrucje, volumen, vrsta_otpad], function(err) {
        if (err) {
            if (err.code === 'SQLITE_CONSTRAINT') {
                res.status(400).json({ error: 'Spremnik s istim nazivom ili RFID-om već postoji.' });
            } else {
                res.status(500).json({ error: err.message });
            }
            return;
        }
        
        const spremnikId = this.lastID; // ID novog spremnika
        
        if (Array.isArray(ocitanja) && ocitanja.length > 0) {
            const stmt = db.prepare("INSERT INTO ocitanja (temperatura, napunjenost, plamen, polozaj, baterija, dim, datetime, spremnik_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            
            ocitanja.forEach(ocitanje => {
                const { temperatura, napunjenost, plamen, polozaj, baterija, dim, datetime } = ocitanje;
                stmt.run(temperatura, napunjenost, plamen, polozaj, baterija, dim, datetime, spremnikId);
            });
            
            stmt.finalize(err => {
                if (err) {
                    res.status(500).json({ error: err.message });
                    return;
                }
                res.json({
                    message: "success",
                    data: { id: spremnikId, naziv, rfid, lat, lng, podrucje, volumen, vrsta_otpad, ocitanja }
                });
            });
        } else {
            res.json({
                message: "success",
                data: { id: spremnikId, naziv, rfid, lat, lng, podrucje, volumen, vrsta_otpad }
            });
        }
    });
});


// Ažuriranje spremnika
router.put("/spremnici/:id", (req, res) => {
    const { naziv, rfid, lat, lng, podrucje, volumen, ocitanja, vrsta_otpad } = req.body;
    const spremnikId = req.params.id;

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        // Provjeravanje jedinstvenosti naziva i rfid-ija
        db.get("SELECT COUNT(*) AS count FROM spremnici WHERE (naziv = ? OR rfid = ?) AND id != ?", [naziv, rfid, spremnikId], function(err, row) {
            if (err) {
                db.run("ROLLBACK");
                res.status(500).json({ error: err.message });
                return;
            }
            if (row.count > 0) {
                db.run("ROLLBACK");
                res.status(400).json({ error: 'Spremnik s istim nazivom ili RFID-om već postoji.' });
                return;
            }

            // Ažuriranje spremnika
            db.run("UPDATE spremnici SET naziv = ?, rfid = ?, lat = ?, lng = ?, podrucje = ?, volumen = ?, vrsta_otpad = ? WHERE id = ?", [naziv, rfid, lat, lng, podrucje, volumen, vrsta_otpad, spremnikId], function(err) {
                if (err) {
                    db.run("ROLLBACK");
                    res.status(500).json({ error: err.message });
                    return;
                }

                // Brisanje postojećih očitanja za spremnik
                db.run("DELETE FROM ocitanja WHERE spremnik_id = ?", [spremnikId], function(err) {
                    if (err) {
                        db.run("ROLLBACK");
                        res.status(500).json({ error: err.message });
                        return;
                    }

                    // Dodavanje novih očitanja
                    const stmt = db.prepare("INSERT INTO ocitanja (temperatura, napunjenost, plamen, polozaj, baterija, dim, datetime, spremnik_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                    ocitanja.forEach(ocitanje => {
                        const { temperatura, napunjenost, plamen, polozaj, baterija, dim, datetime } = ocitanje;
                        stmt.run(temperatura, napunjenost, plamen, polozaj, baterija, dim, datetime, spremnikId, function(err) {
                            if (err) {
                                db.run("ROLLBACK");
                                res.status(500).json({ error: err.message });
                                return;
                            }
                        });
                    });

                    stmt.finalize(err => {
                        if (err) {
                            db.run("ROLLBACK");
                            res.status(500).json({ error: err.message });
                            return;
                        }
                        db.run("COMMIT", err => {
                            if (err) {
                                db.run("ROLLBACK");
                                res.status(500).json({ error: err.message });
                                return;
                            }

                            // Provjera napunjenosti i slanje emaila ako je spremnik pun
                            const najnovijeOcitanje = ocitanja[ocitanja.length - 1];
                            if (najnovijeOcitanje && najnovijeOcitanje.napunjenost >= 75) {
                                db.get("SELECT k.email FROM korisnici k JOIN korisnik_spremnici ks ON k.id = ks.korisnik_id WHERE ks.spremnik_id = ?", [spremnikId], (err, row) => {
                                    if (err) {
                                        console.error("Failed to fetch email:", err.message);
                                    } else if (row && row.email) {
                                        sendEmailNotification(
                                            row.email,
                                            'Obavijest o punom spremniku',
                                            `Spremnik ID: ${spremnikId} je pun i spreman za pražnjenje.`
                                        );
                                    } else {
                                        console.log(`Nema emaila za korisnika spremnika ${spremnikId}`);
                                    }
                                });
                            }

                            // Provjera za požar
                            if (najnovijeOcitanje.plamen && najnovijeOcitanje.dim) {
                                db.get("SELECT k.email FROM korisnici k JOIN korisnik_spremnici ks ON k.id = ks.korisnik_id WHERE ks.spremnik_id = ?", [spremnikId], (err, row) => {
                                    if (err) {
                                        console.error("Failed to fetch email:", err.message);
                                    } else if (row && row.email) {
                                        sendEmailNotification(
                                            row.email,
                                            'Upozorenje: Detektiran požar u spremniku!',
                                            `U spremniku ID: ${spremnikId} je detektiran požar! Molimo poduzmite hitne mjere.`
                                        );
                                    } else {
                                        console.log(`Nema emaila za korisnika spremnika ${spremnikId}`);
                                    }
                                });
                            }

                            res.json({
                                message: "success",
                                data: { id: spremnikId, naziv, rfid, lat, lng, podrucje, volumen, vrsta_otpad, ocitanja }
                            });
                        });
                    });
                });
            });
        });
    });
});


// Brisanje spremnika
router.delete("/spremnici/:id", (req, res) => {
    db.run("DELETE FROM spremnici WHERE id = ?", [req.params.id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({
            message: "success",
            data: { id: req.params.id }
        });
    });
});




// API rute za tablicu 'ocitanja'

// Dohvaćanje svih očitanja
router.get("/ocitanja", (req, res) => {
    db.all("SELECT * FROM ocitanja", (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows || []);
    });
});

// Dohvaćanje jednog očitanja prema ID-iju
router.get("/ocitanja/:id", (req, res) => {
    db.get("SELECT * FROM ocitanja WHERE id = ?", [req.params.id], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({
            message: "success",
            data: row
        });
    });
});

// Dodavanje novog očitanja
router.post("/ocitanja", (req, res) => {
    const { temperatura, napunjenost, plamen, polozaj, baterija, dim, datetime, spremnik_id } = req.body;
    db.run("INSERT INTO ocitanja (temperatura, napunjenost, plamen, polozaj, baterija, dim, datetime, spremnik_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", 
           [temperatura, napunjenost, plamen, polozaj, baterija, dim, datetime, spremnik_id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }

        // Provjera napunjenosti i slanje emaila ako je spremnik pun
        if (napunjenost >= 75) {
            db.get("SELECT k.email FROM korisnici k JOIN spremnici s ON k.spremnik_id = s.id WHERE s.id = ?", [spremnik_id], (err, row) => {
                if (err) {
                    console.error("Failed to fetch email:", err.message);
                } else if (row && row.email) {
                    sendEmailNotification(
                        row.email,
                        'Obavijest o punom spremniku',
                        `Spremnik ID: ${spremnik_id} je pun i spreman za pražnjenje.`
                    );
                }
            });
        }

        res.json({
            message: "success",
            data: { id: this.lastID, temperatura, napunjenost, plamen, polozaj, baterija, dim, datetime, spremnik_id }
        });
    });
});

// Ažuriranje očitanja
router.put("/ocitanja/:id", (req, res) => {
    const { temperatura, napunjenost, plamen, polozaj, baterija, dim, datetime, spremnik_id } = req.body;
    db.run("UPDATE ocitanja SET temperatura = ?, napunjenost = ?, plamen = ?, polozaj = ?, baterija = ?, dim = ?, datetime = ?, spremnik_id = ? WHERE id = ?", 
           [temperatura, napunjenost, plamen, polozaj, baterija, dim, datetime, spremnik_id, req.params.id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({
            message: "success",
            data: { id: req.params.id, temperatura, napunjenost, plamen, polozaj, baterija, dim, datetime, spremnik_id }
        });
    });
});

// Brisanje očitanja
router.delete("/ocitanja/:id", (req, res) => {
    db.run("DELETE FROM ocitanja WHERE id = ?", [req.params.id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({
            message: "success",
            data: { id: req.params.id }
        });
    });
});

module.exports = router;
