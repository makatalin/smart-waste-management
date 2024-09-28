const { Database } = require('turso');
require('dotenv').config();

const db = new Database(process.env.TURSO_URL, {
  authToken: process.env.TURSO_AUTH_TOKEN
});

db.query("PRAGMA foreign_keys = ON")
  .then(() => {
    console.log('Connected to Turso database');
  })
  .catch(err => {
    console.error('Could not connect to database', err);
  });

module.exports = db;

