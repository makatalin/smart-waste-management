const express = require('express');
const router = express.Router();
const db = require('../config/db');

// API ruta za dohvaćanje izvještaja
router.get('/izvjestaji', async (req, res) => {
  const { start, end } = req.query;

  if (!start || !end) {
    return res.status(400).json({ error: 'Missing start or end date' });
  }

  const startDate = new Date(start).toISOString().split('T')[0];
  const endDate = new Date(end).toISOString().split('T')[0];

  try {
    // Graf "Ukupna količina otpada u m3"
    const wasteAmountQuery = `
      SELECT DATE(datetime) AS date, SUM((napunjenost / 100.0) * spremnici.volumen)/1000 AS total
      FROM ocitanja
      JOIN spremnici ON ocitanja.spremnik_id = spremnici.id
      WHERE DATE(datetime) BETWEEN ? AND ?
      GROUP BY DATE(datetime)
    `;
    const wasteAmountData = await new Promise((resolve, reject) => {
      db.all(wasteAmountQuery, [startDate, endDate], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });

    // Graf "Učestalost pražnjenja spremnika"
    const emptyingFrequencyQuery = `
      SELECT s.naziv, COUNT(*) AS count, GROUP_CONCAT(DATE(o1.datetime)) AS empty_dates
      FROM spremnici s
      JOIN ocitanja o1 ON s.id = o1.spremnik_id
      LEFT JOIN (
          SELECT spremnik_id, napunjenost, datetime, polozaj
          FROM ocitanja
      ) o2 ON o1.spremnik_id = o2.spremnik_id 
        AND o2.datetime = (
            SELECT MAX(datetime)
            FROM ocitanja
            WHERE spremnik_id = o1.spremnik_id AND datetime < o1.datetime
        )
      WHERE (o1.napunjenost = 0 
            OR (o2.napunjenost IS NOT NULL AND o2.napunjenost - o1.napunjenost >= 30))
        AND o1.polozaj = 0  -- Računa samo kada je spremnik u ispravnom položaju
        AND DATE(o1.datetime) BETWEEN ? AND ?
      GROUP BY s.naziv;
    `;
    const emptyingFrequencyData = await new Promise((resolve, reject) => {
      db.all(emptyingFrequencyQuery, [startDate, endDate], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });

    // Graf "Prosječna napunjenost spremnika"
    const averageFillLevelQuery = `
      SELECT naziv, AVG(napunjenost) AS average
      FROM ocitanja
      JOIN spremnici ON ocitanja.spremnik_id = spremnici.id
      WHERE DATE(datetime) BETWEEN ? AND ?
      GROUP BY naziv
    `;
    const averageFillLevelData = await new Promise((resolve, reject) => {
      db.all(averageFillLevelQuery, [startDate, endDate], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });

    // Graf "Puni spremnici"
    const overflowCountQuery = `
      SELECT s.naziv, o.napunjenost
      FROM spremnici s
      JOIN (
          SELECT spremnik_id, MAX(datetime) AS latest_datetime
          FROM ocitanja
          WHERE DATE(datetime) BETWEEN ? AND ?
          GROUP BY spremnik_id
      ) latest ON s.id = latest.spremnik_id
      JOIN ocitanja o ON o.spremnik_id = latest.spremnik_id AND o.datetime = latest.latest_datetime
      WHERE o.napunjenost >= 75;
    `;
    const overflowCountData = await new Promise((resolve, reject) => {
      db.all(overflowCountQuery, [startDate, endDate], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });

    // Graf "Prosječna napunjenost prema području"
    const areaUsageQuery = `
      SELECT 
        s.podrucje, 
        AVG(o.napunjenost) AS average_fill, 
        COUNT(CASE 
                WHEN o2.napunjenost IS NOT NULL 
                AND o2.napunjenost - o.napunjenost >= 30 
                AND o.polozaj = 0 
                THEN 1 
                ELSE NULL 
            END) AS emptying_count,
        COUNT(DISTINCT s.id) AS container_count
      FROM ocitanja o
      JOIN spremnici s ON o.spremnik_id = s.id
      LEFT JOIN ocitanja o2 ON o.spremnik_id = o2.spremnik_id 
        AND o2.datetime = (
            SELECT MAX(datetime)
            FROM ocitanja
            WHERE spremnik_id = o.spremnik_id 
            AND datetime < o.datetime
        )
      WHERE DATE(o.datetime) BETWEEN ? AND ?
      GROUP BY s.podrucje;
    `;
    const areaUsageData = await new Promise((resolve, reject) => {
      db.all(areaUsageQuery, [startDate, endDate], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });

    // Graf "Razvrstane količine otpada"
    const wasteVolumeByTypeQuery = `
      SELECT spremnici.vrsta_otpad AS waste_type, 
            SUM((ocitanja.napunjenost / 100.0) * spremnici.volumen) / 1000 AS total_volume
      FROM ocitanja
      JOIN spremnici ON ocitanja.spremnik_id = spremnici.id
      WHERE DATE(ocitanja.datetime) BETWEEN ? AND ?
      GROUP BY spremnici.vrsta_otpad
    `;
    const wasteVolumeByTypeData = await new Promise((resolve, reject) => {
      db.all(wasteVolumeByTypeQuery, [startDate, endDate], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });

/*
    console.log({
      wasteAmountData,
      emptyingFrequencyData,
      averageFillLevelData,
      overflowCountData,
      areaUsageData,
      wasteVolumeByTypeData
    });
*/

    res.json({
      wasteAmount: {
        labels: wasteAmountData.map(row => row.date),
        values: wasteAmountData.map(row => row.total),
        startDate: start,
        endDate: end
      },
      emptyingFrequency: {
        labels: emptyingFrequencyData.map(row => row.naziv),
        values: emptyingFrequencyData.map(row => row.count),
        emptyDatesValues: emptyingFrequencyData.map(row => row.empty_dates),
        startDate: start,
        endDate: end
      },
      averageFillLevel: {
        labels: averageFillLevelData.map(row => row.naziv),
        values: averageFillLevelData.map(row => row.average),
        startDate: start,
        endDate: end
      },
      overflowCount: {
        labels: overflowCountData.map(row => row.naziv),
        values: overflowCountData.map(row => row.napunjenost),
        startDate: start,
        endDate: end
      },
      areaUsage: {
        labels: areaUsageData.map(row => row.podrucje),
        averageFillValues: areaUsageData.map(row => row.average_fill),
        emptyingCountValues: areaUsageData.map(row => row.emptying_count),
        containerCountValues: areaUsageData.map(row => row.container_count),
        startDate: start,
        endDate: end
      },
      wasteVolumeByType: {
        labels: wasteVolumeByTypeData.map(row => row.waste_type),
        values: wasteVolumeByTypeData.map(row => row.total_volume),
        startDate: start,
        endDate: end
      }
    
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

module.exports = router;
