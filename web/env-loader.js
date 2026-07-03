const fs = require('fs')
const path = require('path')

function loadEnvFiles(extraPaths = []) {
    const candidates = [path.join(__dirname, '.env'), path.join(__dirname, '..', '.env'), ...extraPaths]

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

function isPgEnabled() {
    const value = String(process.env.CONNECTION_TO_PG || '')
        .trim()
        .toLowerCase()
    return value === 'true' || value === '1'
}

function getPgConfig() {
    if (process.env.DATABASE_URL) {
        return { connectionString: process.env.DATABASE_URL }
    }

    const host = process.env.PG_HOST || process.env.PGHOST
    const database = process.env.PG_DATABASE || process.env.PGDATABASE
    const user = process.env.PG_USER || process.env.PGUSER
    const password = process.env.PG_PASSWORD || process.env.PGPASSWORD
    const port = Number(process.env.PG_PORT || process.env.PG_PORT || 5432)

    if (!host || !database || !user || password === undefined) {
        throw new Error('CONNECTION_TO_PG=true, ale chybí PG_HOST, PG_DATABASE, PG_USER nebo PG_PASSWORD v .env.')
    }

    return { host, port, database, user, password }
}

module.exports = { loadEnvFiles, isPgEnabled, getPgConfig }
