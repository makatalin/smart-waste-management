const express = require('express');
const router = express.Router();
const db = require('../config/db');
const axios = require('axios');

// Učitavanje dotenv za API ključeve
require('dotenv').config();

// *********************************
// RUTA ZA OPTIMIZACIJU GOOGLE RUTE
// *********************************

router.get('/optimize-route', async (req, res) => {
    try {
        // Dohvaćanje ID-ijeva spremnika
        const binIds = req.query.bins ? req.query.bins.split(',') : [];

        if (binIds.length === 0) {
            return res.status(400).json({ error: 'No bins provided' });
        }

        // *********************************
        // DOHVAĆANJE PODATAKA O SPREMNICIMA IZ BAZE
        // *********************************

        // Priprema SQL upita za dohvaćanje spremnika prema uvjetu "napunjenost >= 75"
        const placeholders = binIds.map(() => '?').join(',');
        const fullBinsQuery = `
            SELECT s.id, s.naziv, s.lat, s.lng 
            FROM spremnici s 
            JOIN ocitanja o ON s.id = o.spremnik_id 
            WHERE o.napunjenost >= 75 AND s.id IN (${placeholders})
        `;
        
        const fullBins = await new Promise((resolve, reject) => {
            db.all(fullBinsQuery, binIds, (err, rows) => {
                if (err) {
                    return reject(err);
                }
                resolve(rows);
            });
        });

        if (fullBins.length === 0) {
            return res.status(200).json({ message: 'No full bins to collect' });
        }

        // *********************************
        // PRIPREMA PODATAKA ZA GOOGLE DIRECTIONS API
        // *********************************

        const waypoints = fullBins
            .filter(bin => bin.lat && bin.lng)
            .map(bin => `${bin.lat},${bin.lng}`)
            .join('|');

        const apiKey = process.env.API_KEY;

        if (!apiKey) {
            throw new Error('API_KEY is not set in the environment variables');
        }

        // Definiranje vremena polaska i rute (polazna i odredišna točka)
        const departureTime = Math.floor(Date.now() / 1000); // Trenutno vrijeme u sekundama
        const origin = '45.768776592272054, 16.02400565769438';
        const destination = '45.76366777041421, 16.028113993446752';
        const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&waypoints=optimize:true|${waypoints}&key=${apiKey}&departure_time=${departureTime}`;

        console.log(`Requesting optimized route with URL: ${url}`);

        // *********************************
        // SLANJE ZAHTJEVA GOOGLE DIRECTIONS API-U
        // *********************************

        const response = await axios.get(url);

        if (response.data.error_message) {
            throw new Error(response.data.error_message);
        }

        res.json(response.data);
    } catch (error) {
        console.error('Error while optimizing route:', error);
        res.status(500).json({ error: 'Failed to optimize route', details: error.message });
    }
});

module.exports = router;
