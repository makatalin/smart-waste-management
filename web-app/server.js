const express = require("express")
const app = express()
const port = 3003;

require('dotenv').config();

app.use(express.json());

// Inicijalizacija globalne varijable za praćenje SSE klijenata
global.sseClients = [];

// Static files
app.use(express.static('./public_files'))

// Ruta za web aplikaciju
const webRoutes = require('./api/rest.js')
app.use("/rest",webRoutes);

// Ruta za Raspberry Pi
const raspberryRoutes = require('./api/raspberry.js')
app.use("/rest/raspberry",raspberryRoutes);

// Ruta za korisnike
const korisniciRoutes = require('./api/korisnici.js');
app.use("/rest/korisnici", korisniciRoutes);

// Ruta za email obavijesti
const notifyRoutes = require('./api/rest.js');
app.use("/rest", notifyRoutes);

// Ruta za izvještaje
const izvjestajiRoutes = require('./api/izvjestaji.js');
app.use("/rest", izvjestajiRoutes);

// Ruta za optimizaciju Google rute
const routeRoutes = require('./api/route.js');
app.use("/route", routeRoutes);

// Ruta za Server-Sent Events (SSE)
app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    global.sseClients.push(res);

    req.on('close', () => {
        global.sseClients = global.sseClients.filter(client => client !== res);
    });
});

// Glavna stranica
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public_files/index.html');
});

// Korisnici
app.get('/korisnici', (req, res) => {
    res.sendFile(__dirname + '/public_files/korisnici.html');
});

// Izvještaji
app.get('/izvjestaji', (req, res) => {
    res.sendFile(__dirname + '/public_files/izvjestaji.html');
});

app.listen(port, () => {
    console.log(`Aplikacija sluša na portu ${port}`)
})