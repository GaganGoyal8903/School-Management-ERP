const {
  executeQuery,
  executeStoredProcedure,
  executeInTransaction,
} = require('../config/sqlServer');

const runQuery = async (statement, params = {}) => {
  return executeQuery(statement, params);
};

const runStoredProcedure = async (procedureName, params = {}) => {
  return executeStoredProcedure(procedureName, params);
};

const withSqlTransaction = async (handler) => {
  return executeInTransaction(handler);
};

module.exports = {
  runQuery,
  runStoredProcedure,
  withSqlTransaction,
};
