var mysql = require("mysql2");
require("dotenv").config();

const config = {
  connectionLimit: 4,
  host: process.env.host, // "localhost"
  user: process.env.user, // "root"
  password: process.env.DBpassword,
  database: process.env.database,
};

const pool = mysql.createPool(config);

const connection = () => {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err) {
        console.error("Database connection error:", err);
        reject(err);
        return;
      }

      console.log("MySQL pool connected: threadId " + connection.threadId);

      const query = (sql, binding) => {
        return new Promise((resolve, reject) => {
          connection.query(sql, binding, (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        });
      };

      const release = () => {
        return new Promise((resolve, reject) => {
          try {
            console.log("MySQL pool released: threadId " + connection.threadId);
            connection.release();
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      };

      resolve({ query, release });
    });
  });
};

const query = (sql, binding) => {
  return new Promise((resolve, reject) => {
    pool.query(sql, binding, (err, result, fields) => {
      if (err) {
        console.error("Query error:", err);
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
};

module.exports = { pool, connection, query };
