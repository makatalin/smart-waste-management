const express = require("express");
const router = express.Router();
const db = require('../config/db');

router.use(express.json());

router.post("/ocitanja", (req, res) => {
    const ocitanja = req.body;

    if (!Array.isArray(ocitanja) || ocitanja.length === 0) {
        return res.status(400).json({ error: 'Expected an array of readings' });
    }
    console.log(JSON.stringify(ocitanja, null, 2));

    db.serialize(() => {
        let remaining = ocitanja.length;
        let hasError = false;

        ocitanja.forEach((ocitanje) => {
            const { naziv, rfid, lat, lng, vrsta_otpad, podrucje, volumen, temperatura, napunjenost, plamen, polozaj, baterija, dim, datetime } = ocitanje;

            db.get("SELECT id, naziv, lat, lng, vrsta_otpad, podrucje, volumen FROM spremnici WHERE rfid = ?", [rfid], (err, row) => {
                if (err) {
                    console.error(`Greška pri provjeri spremnika: ${err.message}`);
                    if (!hasError) {
                        hasError = true;
                        return res.status(500).json({ error: err.message });
                    }
                }

                if (!row) {
                    db.run("INSERT INTO spremnici (naziv, rfid, lat, lng, vrsta_otpad, podrucje, volumen) VALUES (?, ?, ?, ?, ?, ?, ?)", [naziv, rfid, lat, lng, vrsta_otpad, podrucje, volumen], function(err) {
                        if (err) {
                            console.error(`Greška pri dodavanju spremnika: ${err.message}`);
                            if (!hasError) {
                                hasError = true;
                                return res.status(500).json({ error: err.message });
                            }
                        } else {
                            const newSpremnikId = this.lastID;
                            db.run("INSERT INTO ocitanja (spremnik_id, temperatura, napunjenost, plamen, polozaj, baterija, dim, datetime) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                                [newSpremnikId, temperatura, napunjenost, plamen, polozaj, baterija, dim, datetime], function(err) {
                                    if (err) {
                                        console.error(`Greška pri dodavanju očitanja: ${err.message}`);
                                        if (!hasError) {
                                            hasError = true;
                                            return res.status(500).json({ error: err.message });
                                        }
                                    }

                                    // Slanje SSE događaja
                                    const eventData = {
                                        action: 'newBin',
                                        data: {
                                            id: newSpremnikId,
                                            naziv,
                                            rfid,
                                            lat,
                                            lng,
                                            vrsta_otpad,
                                            podrucje,
                                            volumen,
                                            ocitanja: [{ temperatura, napunjenost, plamen, polozaj, baterija, dim, datetime }]
                                        }
                                    };
                                    global.sseClients.forEach(client => client.write(`data: ${JSON.stringify(eventData)}\n\n`));

                                    remaining--;
                                    if (remaining === 0 && !hasError) {
                                        return res.json({ message: "success" });
                                    }
                                });
                        }
                    });
                } else {
                    const existingSpremnikId = row.id;

                    if (
                        row.naziv !== naziv ||
                        row.lat !== lat ||
                        row.lng !== lng ||
                        row.vrsta_otpad !== vrsta_otpad ||
                        row.podrucje !== podrucje ||
                        row.volumen !== volumen
                    ) {
                        db.run("UPDATE spremnici SET naziv = ?, lat = ?, lng = ?, vrsta_otpad = ?, podrucje = ?, volumen = ? WHERE id = ?",
                            [naziv, lat, lng, vrsta_otpad, podrucje, volumen, existingSpremnikId], function(err) {
                                if (err) {
                                    console.error(`Greška pri ažuriranju spremnika: ${err.message}`);
                                    if (!hasError) {
                                        hasError = true;
                                        return res.status(500).json({ error: err.message });
                                    }
                                }
                            });
                    }

                    db.run("INSERT INTO ocitanja (spremnik_id, temperatura, napunjenost, plamen, polozaj, baterija, dim, datetime) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        [existingSpremnikId, temperatura, napunjenost, plamen, polozaj, baterija, dim, datetime], function(err) {
                            if (err) {
                                console.error(`Greška pri dodavanju očitanja: ${err.message}`);
                                if (!hasError) {
                                    hasError = true;
                                    return res.status(500).json({ error: err.message });
                                }
                            }

                            // Slanje SSE događaja
                            const eventData = {
                                action: 'updateBin',
                                data: {
                                    id: existingSpremnikId,
                                    naziv,
                                    rfid,
                                    lat,
                                    lng,
                                    vrsta_otpad,
                                    podrucje,
                                    volumen,
                                    ocitanja: [{ temperatura, napunjenost, plamen, polozaj, baterija, dim, datetime }]
                                }
                            };
                            global.sseClients.forEach(client => client.write(`data: ${JSON.stringify(eventData)}\n\n`));

                            remaining--;
                            if (remaining === 0 && !hasError) {
                                return res.json({ message: "success" });
                            }
                        });
                }
            });
        });
    });
});

module.exports = router;
