require("dotenv").config();
const mysql2 = require('mysql2/promise');

const pool = mysql2.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'password',
    database: process.env.MYSQL_DATABASE || 'geoguessr',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
})

const query = async (sql, params) => {
    const [rows] = await pool.execute(sql, params);
    return rows;
}

module.exports = {
    query
};