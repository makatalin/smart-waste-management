const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../PametniOtpad.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Could not connect to database', err);
  } else {
    db.run("PRAGMA foreign_keys = ON", (err) => {
      if (err) {
        console.error('Error enabling foreign keys:', err);
      }
    });
  }
});

module.exports = db;

