#!/usr/bin/env node
/**
 * Spustí všechny SQL soubory v pg-scripts/ ve formátu N_nazev.sql v jedné transakci.
 *
 * Použití:
 *   cd pg-scripts
 *   npm install
 *   cp .env.example .env   (uprav hodnoty)
 *   set -a && source .env && set +a   (Linux/macOS)
 *   # Windows PowerShell: načti proměnné ručně nebo použij DATABASE_URL
 *   npm run migrate
 */

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const SCRIPTS_DIR = __dirname

function loadEnvFile() {
    const candidates = [path.join(SCRIPTS_DIR, '.env'), path.join(SCRIPTS_DIR, '..', '.env')]

    for (const envPath of candidates) {
        if (!fs.existsSync(envPath)) continue
        const content = fs.readFileSync(envPath, 'utf8')
        for (const line of content.split(/\r?\n/)) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith('#')) continue
            const eq = trimmed.indexOf('=')
            if (eq === -1) continue
            const key = trimmed.slice(0, eq).trim()
            let value = trimmed.slice(eq + 1).trim()
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1)
            }
            if (process.env[key] === undefined) {
                process.env[key] = value
            }
        }
    }
}

function getClientConfig() {
    if (process.env.DATABASE_URL) {
        return { connectionString: process.env.DATABASE_URL }
    }

    const required = ['PG_HOST', 'PG_DATABASE', 'PG_USER', 'PG_PASSWORD']
    const missing = required.filter((key) => !process.env[key])
    if (missing.length) {
        throw new Error(`Chybí proměnné prostředí: ${missing.join(', ')}. Zkopíruj .env.example → .env nebo nastav DATABASE_URL.`)
    }

    return {
        host: process.env.PG_HOST,
        port: Number(process.env.PG_PORT || 5432),
        database: process.env.PG_DATABASE,
        user: process.env.PG_USER,
        password: process.env.PG_PASSWORD
    }
}

function listSqlFiles() {
    return fs
        .readdirSync(SCRIPTS_DIR)
        .filter((name) => /^\d+_.+\.sql$/i.test(name))
        .sort((a, b) => {
            const numA = parseInt(a.split('_')[0], 10)
            const numB = parseInt(b.split('_')[0], 10)
            return numA - numB || a.localeCompare(b)
        })
}

async function run() {
    loadEnvFile()
    const files = listSqlFiles()

    if (!files.length) {
        console.error('Žádné SQL soubory (N_nazev.sql) v pg-scripts/.')
        process.exit(1)
    }

    const client = new Client(getClientConfig())
    await client.connect()

    console.log(`Připojeno k ${process.env.PG_DATABASE || 'databázi'}.`)
    console.log(`Spouštím ${files.length} skript(ů) v transakci…\n`)

    try {
        await client.query('BEGIN')

        for (const file of files) {
            const sql = fs.readFileSync(path.join(SCRIPTS_DIR, file), 'utf8')
            console.log(`→ ${file}`)
            await client.query(sql)
        }

        await client.query('COMMIT')
        console.log('\nHotovo — COMMIT proběhl, schéma je vytvořené.')
    } catch (err) {
        await client.query('ROLLBACK')
        console.error('\nChyba — ROLLBACK, žádná změna nezůstala.')
        console.error(err.message || err)
        process.exitCode = 1
    } finally {
        await client.end()
    }
}

run()
