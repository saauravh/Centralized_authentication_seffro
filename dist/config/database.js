"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
exports.query = query;
exports.queryOne = queryOne;
const promise_1 = __importDefault(require("mysql2/promise"));
const index_1 = require("./index");
let pool;
async function getDb() {
    if (!pool) {
        pool = promise_1.default.createPool({
            host: index_1.config.db.host,
            port: index_1.config.db.port,
            user: index_1.config.db.user,
            password: index_1.config.db.password,
            database: index_1.config.db.name,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
        });
    }
    return pool;
}
async function query(sql, params) {
    const db = await getDb();
    const [rows] = await db.execute(sql, params);
    return rows;
}
async function queryOne(sql, params) {
    const rows = await query(sql, params);
    return rows[0] || null;
}
//# sourceMappingURL=database.js.map