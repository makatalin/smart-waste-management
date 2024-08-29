const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./PametniOtpad.db', (err) => {
    if (err) {
        console.error('Could not connect to database', err);
    } else {
        db.run("PRAGMA foreign_keys = ON");
    }
});

module.exports = db;
