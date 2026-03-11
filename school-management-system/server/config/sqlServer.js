let sql = null;
let sqlDriverLoadError = null;

try {
  sql = require('mssql/msnodesqlv8');
} catch (error) {
  sqlDriverLoadError = error;
}

const DEFAULT_SQL_SERVER = '(localdb)\\MSSQLLocalDB';
const DEFAULT_SQL_DATABASE = 'SchoolERP';
const DEFAULT_SQL_DRIVER = 'msnodesqlv8';

let poolPromise = null;

const toBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return ['true', '1', 'yes', 'y'].includes(String(value).trim().toLowerCase());
};

const sqlConfig = {
  server: process.env.SQL_SERVER || DEFAULT_SQL_SERVER,
  database: process.env.SQL_DATABASE || DEFAULT_SQL_DATABASE,
  driver: process.env.SQL_DRIVER || DEFAULT_SQL_DRIVER,
  options: {
    trustedConnection: toBool(process.env.SQL_TRUSTED_CONNECTION, true),
    trustServerCertificate: toBool(process.env.SQL_TRUST_CERT, true),
    enableArithAbort: true,
  },
  pool: {
    max: Number(process.env.SQL_POOL_MAX || 10),
    min: Number(process.env.SQL_POOL_MIN || 1),
    idleTimeoutMillis: Number(process.env.SQL_POOL_IDLE_TIMEOUT_MS || 30000),
  },
  connectionTimeout: Number(process.env.SQL_CONNECTION_TIMEOUT_MS || 30000),
  requestTimeout: Number(process.env.SQL_REQUEST_TIMEOUT_MS || 30000),
};

const isSqlBootstrapEnabled = () => toBool(process.env.SQL_BOOTSTRAP_ENABLED, true);

const getSqlClient = () => {
  if (sql) {
    return sql;
  }

  const installHint = 'Install `mssql` and `msnodesqlv8` in `server` to enable SQL bootstrap.';
  const driverMessage = sqlDriverLoadError?.message ? ` ${sqlDriverLoadError.message}` : '';
  throw new Error(`[sql] SQL Server driver unavailable.${driverMessage} ${installHint}`.trim());
};

const bindInputParams = (request, params = {}) => {
  if (Array.isArray(params)) {
    params.forEach((param) => {
      if (!param || !param.name) {
        return;
      }

      if (param.type) {
        request.input(param.name, param.type, param.value);
        return;
      }

      request.input(param.name, param.value);
    });
    return;
  }

  Object.entries(params).forEach(([name, value]) => {
    request.input(name, value);
  });
};

const initSqlServer = async () => {
  if (!isSqlBootstrapEnabled()) {
    console.log('[sql] SQL bootstrap disabled by SQL_BOOTSTRAP_ENABLED=false');
    return null;
  }

  if (!poolPromise) {
    poolPromise = (async () => {
      const client = getSqlClient();
      const pool = await client.connect(sqlConfig);

      pool.on('error', (error) => {
        console.error('[sql] Connection pool error:', error.message);
      });

      console.log(`[sql] Connected to ${sqlConfig.server} / ${sqlConfig.database}`);
      return pool;
    })().catch((error) => {
      poolPromise = null;
      throw error;
    });
  }

  return poolPromise;
};

const getPool = async () => {
  const pool = await initSqlServer();
  if (!pool) {
    throw new Error('[sql] SQL pool is not initialized.');
  }
  return pool;
};

const createRequest = async (params = {}) => {
  const pool = await getPool();
  const request = pool.request();
  bindInputParams(request, params);
  return request;
};

const executeQuery = async (statement, params = {}) => {
  const request = await createRequest(params);
  return request.query(statement);
};

const executeStoredProcedure = async (procedureName, params = {}) => {
  const request = await createRequest(params);
  return request.execute(procedureName);
};

const executeInTransaction = async (handler) => {
  const client = getSqlClient();
  const pool = await getPool();
  const transaction = new client.Transaction(pool);
  await transaction.begin(client.ISOLATION_LEVEL.READ_COMMITTED);

  try {
    const txQuery = async (statement, params = {}) => {
      const request = new client.Request(transaction);
      bindInputParams(request, params);
      return request.query(statement);
    };

    const txStoredProcedure = async (procedureName, params = {}) => {
      const request = new client.Request(transaction);
      bindInputParams(request, params);
      return request.execute(procedureName);
    };

    const result = await handler({
      query: txQuery,
      executeStoredProcedure: txStoredProcedure,
      client,
      transaction,
    });

    await transaction.commit();
    return result;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error('[sql] Transaction rollback error:', rollbackError.message);
    }
    throw error;
  }
};

const closeSqlServer = async () => {
  if (!poolPromise) {
    return;
  }

  try {
    const pool = await poolPromise;
    await pool.close();
  } finally {
    poolPromise = null;
  }
};

module.exports = {
  getSqlClient,
  sqlConfig,
  bindInputParams,
  initSqlServer,
  getPool,
  createRequest,
  executeQuery,
  executeStoredProcedure,
  executeInTransaction,
  closeSqlServer,
};
