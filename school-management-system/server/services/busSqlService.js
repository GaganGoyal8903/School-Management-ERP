const {
  getSqlClient,
  executeQuery,
  executeInTransaction,
} = require('../config/sqlServer');

let busBootstrapPromise = null;

const toNullableString = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
};

const parseNumericId = (value) => {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
};

const toNumber = (value, fallback = null) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const parseRouteStops = (value) => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

const stringifyRouteStops = (value) => {
  const normalized = Array.isArray(value) ? value : [];
  return normalized.length ? JSON.stringify(normalized) : null;
};

const mapAssignedStudentRow = (row) => ({
  studentId: row.StudentFullName
    ? {
        _id: String(row.StudentId),
        fullName: row.StudentFullName,
        class: row.ClassName || '',
        section: row.SectionName || '',
      }
    : String(row.StudentId),
  stopName: row.PickupPoint || row.DropPoint || '',
  pickupPoint: row.PickupPoint || '',
  dropPoint: row.DropPoint || '',
  status: row.AssignmentStatus || 'Active',
});

const mapBusRow = (row, assignedStudents = []) => {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.VehicleId),
    id: String(row.VehicleId),
    busNumber: row.VehicleNumber,
    registrationNumber: row.RegistrationNumber || row.VehicleNumber,
    driverName: row.DriverName || '',
    driverPhone: row.DriverPhone || '',
    driverLicense: row.DriverLicense || '',
    routeName: row.RouteName || '',
    routeStops: parseRouteStops(row.RouteStopsJson),
    capacity: Number(row.Capacity || 0),
    currentStatus: row.CurrentStatus || 'Active',
    gpsLocation: {
      latitude: row.GpsLatitude === null || row.GpsLatitude === undefined ? null : Number(row.GpsLatitude),
      longitude: row.GpsLongitude === null || row.GpsLongitude === undefined ? null : Number(row.GpsLongitude),
      speed: row.GpsSpeed === null || row.GpsSpeed === undefined ? 0 : Number(row.GpsSpeed),
      lastUpdated: row.LastLocationUpdated ? new Date(row.LastLocationUpdated) : null,
    },
    assignedStudents,
    isActive: row.IsActive === true || row.IsActive === 1,
    createdAt: row.CreatedAt ? new Date(row.CreatedAt) : null,
    updatedAt: row.UpdatedAt ? new Date(row.UpdatedAt) : null,
  };
};

const ensureBusSqlReady = async () => {
  if (!busBootstrapPromise) {
    busBootstrapPromise = (async () => {
      await executeQuery(`
        IF COL_LENGTH('dbo.TransportVehicles', 'RegistrationNumber') IS NULL
          ALTER TABLE dbo.TransportVehicles ADD RegistrationNumber NVARCHAR(100) NULL;
        IF COL_LENGTH('dbo.TransportVehicles', 'DriverLicense') IS NULL
          ALTER TABLE dbo.TransportVehicles ADD DriverLicense NVARCHAR(100) NULL;
        IF COL_LENGTH('dbo.TransportVehicles', 'RouteStopsJson') IS NULL
          ALTER TABLE dbo.TransportVehicles ADD RouteStopsJson NVARCHAR(MAX) NULL;
        IF COL_LENGTH('dbo.TransportVehicles', 'CurrentStatus') IS NULL
          ALTER TABLE dbo.TransportVehicles ADD CurrentStatus NVARCHAR(50) NOT NULL CONSTRAINT DF_TransportVehicles_CurrentStatus DEFAULT (N'Active');
        IF COL_LENGTH('dbo.TransportVehicles', 'GpsLatitude') IS NULL
          ALTER TABLE dbo.TransportVehicles ADD GpsLatitude DECIMAL(10, 6) NULL;
        IF COL_LENGTH('dbo.TransportVehicles', 'GpsLongitude') IS NULL
          ALTER TABLE dbo.TransportVehicles ADD GpsLongitude DECIMAL(10, 6) NULL;
        IF COL_LENGTH('dbo.TransportVehicles', 'GpsSpeed') IS NULL
          ALTER TABLE dbo.TransportVehicles ADD GpsSpeed DECIMAL(10, 2) NULL;
        IF COL_LENGTH('dbo.TransportVehicles', 'LastLocationUpdated') IS NULL
          ALTER TABLE dbo.TransportVehicles ADD LastLocationUpdated DATETIME2(0) NULL;
        IF COL_LENGTH('dbo.TransportVehicles', 'IsActive') IS NULL
          ALTER TABLE dbo.TransportVehicles ADD IsActive BIT NOT NULL CONSTRAINT DF_TransportVehicles_IsActive DEFAULT (1);
      `);
    })().catch((error) => {
      busBootstrapPromise = null;
      throw error;
    });
  }

  return busBootstrapPromise;
};

const BUS_BASE_SELECT = `
  SELECT
    tv.VehicleId,
    tv.VehicleNumber,
    tv.DriverName,
    tv.DriverPhone,
    tv.RouteName,
    tv.Capacity,
    tv.CreatedAt,
    tv.UpdatedAt,
    tv.RegistrationNumber,
    tv.DriverLicense,
    tv.RouteStopsJson,
    tv.CurrentStatus,
    tv.GpsLatitude,
    tv.GpsLongitude,
    tv.GpsSpeed,
    tv.LastLocationUpdated,
    tv.IsActive
  FROM dbo.TransportVehicles tv
`;

const buildBusFilters = ({ vehicleId = null, status = null, routeName = null } = {}) => {
  const sql = getSqlClient();
  const clauses = ['ISNULL(tv.IsActive, 1) = 1'];
  const params = [];

  const vehicleSqlId = parseNumericId(vehicleId);
  if (vehicleSqlId) {
    clauses.push('tv.VehicleId = @VehicleId');
    params.push({ name: 'VehicleId', type: sql.Int, value: vehicleSqlId });
  }

  if (status) {
    clauses.push('tv.CurrentStatus = @CurrentStatus');
    params.push({ name: 'CurrentStatus', type: sql.NVarChar(50), value: toNullableString(status) });
  }

  if (routeName) {
    clauses.push('tv.RouteName = @RouteName');
    params.push({ name: 'RouteName', type: sql.NVarChar(200), value: toNullableString(routeName) });
  }

  return {
    params,
    whereClause: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
  };
};

const getAssignmentsForVehicles = async (vehicleIds = []) => {
  const normalizedVehicleIds = [...new Set(vehicleIds.map(parseNumericId).filter(Boolean))];
  if (!normalizedVehicleIds.length) {
    return new Map();
  }

  const sql = getSqlClient();
  const params = normalizedVehicleIds.map((vehicleId, index) => ({ name: `VehicleId${index}`, type: sql.Int, value: vehicleId }));
  const result = await executeQuery(`
    SELECT
      sta.AssignmentId,
      sta.VehicleId,
      sta.StudentId,
      sta.PickupPoint,
      sta.DropPoint,
      sta.Status AS AssignmentStatus,
      st.FullName AS StudentFullName,
      c.ClassName,
      sec.SectionName
    FROM dbo.StudentTransportAssignments sta
    INNER JOIN dbo.Students st
      ON st.StudentId = sta.StudentId
    LEFT JOIN dbo.Classes c
      ON c.ClassId = st.ClassId
    LEFT JOIN dbo.Sections sec
      ON sec.SectionId = st.SectionId
    WHERE sta.VehicleId IN (${normalizedVehicleIds.map((_, index) => `@VehicleId${index}`).join(', ')})
      AND sta.Status = N'Active'
    ORDER BY sta.AssignmentId DESC;
  `, params);

  const grouped = new Map();
  for (const row of result?.recordset || []) {
    const vehicleId = parseNumericId(row.VehicleId);
    if (!grouped.has(vehicleId)) {
      grouped.set(vehicleId, []);
    }
    grouped.get(vehicleId).push(mapAssignedStudentRow(row));
  }

  return grouped;
};

const getBusList = async ({ status = null, routeName = null } = {}) => {
  await ensureBusSqlReady();
  const filter = buildBusFilters({ status, routeName });
  const result = await executeQuery(`
    ${BUS_BASE_SELECT}
    ${filter.whereClause}
    ORDER BY tv.VehicleNumber ASC, tv.VehicleId ASC;
  `, filter.params);

  const vehicleRows = result?.recordset || [];
  const assignments = await getAssignmentsForVehicles(vehicleRows.map((row) => row.VehicleId));
  return vehicleRows.map((row) => mapBusRow(row, assignments.get(parseNumericId(row.VehicleId)) || []));
};

const getBusRecordById = async (vehicleId) => {
  await ensureBusSqlReady();
  const filter = buildBusFilters({ vehicleId });
  const result = await executeQuery(`
    ${BUS_BASE_SELECT}
    ${filter.whereClause};
  `, filter.params);

  const row = result?.recordset?.[0];
  if (!row) {
    return null;
  }

  const assignments = await getAssignmentsForVehicles([row.VehicleId]);
  return mapBusRow(row, assignments.get(parseNumericId(row.VehicleId)) || []);
};

const createBusRecord = async (input = {}) => {
  await ensureBusSqlReady();

  const createdVehicleId = await executeInTransaction(async (tx) => {
    const sql = getSqlClient();
    const inserted = await tx.query(
      `INSERT INTO dbo.TransportVehicles (
         VehicleNumber,
         DriverName,
         DriverPhone,
         RouteName,
         Capacity,
         RegistrationNumber,
         DriverLicense,
         RouteStopsJson,
         CurrentStatus,
         GpsLatitude,
         GpsLongitude,
         GpsSpeed,
         LastLocationUpdated,
         IsActive,
         CreatedAt,
         UpdatedAt
       )
       OUTPUT INSERTED.VehicleId
       VALUES (
         @VehicleNumber,
         @DriverName,
         @DriverPhone,
         @RouteName,
         @Capacity,
         @RegistrationNumber,
         @DriverLicense,
         @RouteStopsJson,
         @CurrentStatus,
         NULL,
         NULL,
         0,
         NULL,
         1,
         SYSUTCDATETIME(),
         SYSUTCDATETIME()
       )`,
      [
        { name: 'VehicleNumber', type: sql.NVarChar(100), value: toNullableString(input.busNumber) },
        { name: 'DriverName', type: sql.NVarChar(200), value: toNullableString(input.driverName) },
        { name: 'DriverPhone', type: sql.NVarChar(40), value: toNullableString(input.driverPhone) },
        { name: 'RouteName', type: sql.NVarChar(200), value: toNullableString(input.routeName) },
        { name: 'Capacity', type: sql.Int, value: toNumber(input.capacity, 0) || 0 },
        { name: 'RegistrationNumber', type: sql.NVarChar(100), value: toNullableString(input.registrationNumber) },
        { name: 'DriverLicense', type: sql.NVarChar(100), value: toNullableString(input.driverLicense) },
        { name: 'RouteStopsJson', type: sql.NVarChar(sql.MAX), value: stringifyRouteStops(input.routeStops) },
        { name: 'CurrentStatus', type: sql.NVarChar(50), value: toNullableString(input.currentStatus) || 'Active' },
      ]
    );

    return parseNumericId(inserted?.recordset?.[0]?.VehicleId);
  });

  return getBusRecordById(createdVehicleId);
};

const updateBusRecord = async (vehicleId, updates = {}) => {
  await ensureBusSqlReady();
  const vehicleSqlId = parseNumericId(vehicleId);
  const existingBus = await getBusRecordById(vehicleSqlId);
  if (!existingBus) {
    return null;
  }

  const sql = getSqlClient();
  await executeQuery(
    `UPDATE dbo.TransportVehicles
     SET VehicleNumber = @VehicleNumber,
         DriverName = @DriverName,
         DriverPhone = @DriverPhone,
         RouteName = @RouteName,
         Capacity = @Capacity,
         RegistrationNumber = @RegistrationNumber,
         DriverLicense = @DriverLicense,
         RouteStopsJson = @RouteStopsJson,
         CurrentStatus = @CurrentStatus,
         UpdatedAt = SYSUTCDATETIME()
     WHERE VehicleId = @VehicleId`,
    [
      { name: 'VehicleId', type: sql.Int, value: vehicleSqlId },
      { name: 'VehicleNumber', type: sql.NVarChar(100), value: toNullableString(updates.busNumber ?? existingBus.busNumber) },
      { name: 'DriverName', type: sql.NVarChar(200), value: toNullableString(updates.driverName ?? existingBus.driverName) },
      { name: 'DriverPhone', type: sql.NVarChar(40), value: toNullableString(updates.driverPhone ?? existingBus.driverPhone) },
      { name: 'RouteName', type: sql.NVarChar(200), value: toNullableString(updates.routeName ?? existingBus.routeName) },
      { name: 'Capacity', type: sql.Int, value: toNumber(updates.capacity ?? existingBus.capacity, 0) || 0 },
      { name: 'RegistrationNumber', type: sql.NVarChar(100), value: toNullableString(updates.registrationNumber ?? existingBus.registrationNumber) },
      { name: 'DriverLicense', type: sql.NVarChar(100), value: toNullableString(updates.driverLicense ?? existingBus.driverLicense) },
      { name: 'RouteStopsJson', type: sql.NVarChar(sql.MAX), value: stringifyRouteStops(updates.routeStops ?? existingBus.routeStops) },
      { name: 'CurrentStatus', type: sql.NVarChar(50), value: toNullableString(updates.currentStatus ?? existingBus.currentStatus) || 'Active' },
    ]
  );

  return getBusRecordById(vehicleSqlId);
};

const updateBusLocationRecord = async (vehicleId, { latitude, longitude, speed } = {}) => {
  await ensureBusSqlReady();
  const vehicleSqlId = parseNumericId(vehicleId);
  const existingBus = await getBusRecordById(vehicleSqlId);
  if (!existingBus) {
    return null;
  }

  const sql = getSqlClient();
  await executeQuery(
    `UPDATE dbo.TransportVehicles
     SET GpsLatitude = @GpsLatitude,
         GpsLongitude = @GpsLongitude,
         GpsSpeed = @GpsSpeed,
         LastLocationUpdated = SYSUTCDATETIME(),
         UpdatedAt = SYSUTCDATETIME()
     WHERE VehicleId = @VehicleId`,
    [
      { name: 'VehicleId', type: sql.Int, value: vehicleSqlId },
      { name: 'GpsLatitude', type: sql.Decimal(10, 6), value: toNumber(latitude, null) },
      { name: 'GpsLongitude', type: sql.Decimal(10, 6), value: toNumber(longitude, null) },
      { name: 'GpsSpeed', type: sql.Decimal(10, 2), value: toNumber(speed, 0) || 0 },
    ]
  );

  return getBusRecordById(vehicleSqlId);
};

const assignStudentToBusRecord = async (vehicleId, { studentId, stopName } = {}) => {
  await ensureBusSqlReady();
  const vehicleSqlId = parseNumericId(vehicleId);
  const studentSqlId = parseNumericId(studentId);
  if (!vehicleSqlId || !studentSqlId) {
    return { resultCode: 'invalid_payload' };
  }

  const bus = await getBusRecordById(vehicleSqlId);
  if (!bus) {
    return { resultCode: 'not_found' };
  }

  const sql = getSqlClient();
  const existingAssignment = await executeQuery(
    `SELECT TOP 1 AssignmentId
     FROM dbo.StudentTransportAssignments
     WHERE VehicleId = @VehicleId
       AND StudentId = @StudentId
       AND Status = N'Active'`,
    [
      { name: 'VehicleId', type: sql.Int, value: vehicleSqlId },
      { name: 'StudentId', type: sql.Int, value: studentSqlId },
    ]
  );

  if (parseNumericId(existingAssignment?.recordset?.[0]?.AssignmentId)) {
    return { resultCode: 'already_assigned' };
  }

  if ((bus.assignedStudents || []).length >= Number(bus.capacity || 0)) {
    return { resultCode: 'full' };
  }

  await executeQuery(
    `INSERT INTO dbo.StudentTransportAssignments (
       StudentId,
       VehicleId,
       PickupPoint,
       DropPoint,
       MonthlyFee,
       StartDate,
       EndDate,
       Status,
       CreatedAt,
       UpdatedAt
     )
     VALUES (
       @StudentId,
       @VehicleId,
       @PickupPoint,
       NULL,
       NULL,
       CAST(GETUTCDATE() AS DATE),
       NULL,
       N'Active',
       SYSUTCDATETIME(),
       SYSUTCDATETIME()
     )`,
    [
      { name: 'StudentId', type: sql.Int, value: studentSqlId },
      { name: 'VehicleId', type: sql.Int, value: vehicleSqlId },
      { name: 'PickupPoint', type: sql.NVarChar(200), value: toNullableString(stopName) },
    ]
  );

  return { resultCode: 'ok', bus: await getBusRecordById(vehicleSqlId) };
};

const removeStudentFromBusRecord = async (vehicleId, studentId) => {
  await ensureBusSqlReady();
  const vehicleSqlId = parseNumericId(vehicleId);
  const studentSqlId = parseNumericId(studentId);
  if (!vehicleSqlId || !studentSqlId) {
    return { resultCode: 'not_found' };
  }

  const sql = getSqlClient();
  await executeQuery(
    `UPDATE dbo.StudentTransportAssignments
     SET Status = N'Inactive',
         EndDate = CAST(GETUTCDATE() AS DATE),
         UpdatedAt = SYSUTCDATETIME()
     WHERE VehicleId = @VehicleId
       AND StudentId = @StudentId
       AND Status = N'Active'`,
    [
      { name: 'VehicleId', type: sql.Int, value: vehicleSqlId },
      { name: 'StudentId', type: sql.Int, value: studentSqlId },
    ]
  );

  return { resultCode: 'ok', bus: await getBusRecordById(vehicleSqlId) };
};

const deleteBusRecord = async (vehicleId) => {
  await ensureBusSqlReady();
  const vehicleSqlId = parseNumericId(vehicleId);
  const existingBus = await getBusRecordById(vehicleSqlId);
  if (!existingBus) {
    return { resultCode: 'not_found' };
  }

  const sql = getSqlClient();
  await executeQuery(
    `UPDATE dbo.TransportVehicles
     SET IsActive = 0,
         CurrentStatus = N'Inactive',
         UpdatedAt = SYSUTCDATETIME()
     WHERE VehicleId = @VehicleId`,
    [{ name: 'VehicleId', type: sql.Int, value: vehicleSqlId }]
  );

  return { resultCode: 'ok' };
};

const getBusStatistics = async () => {
  await ensureBusSqlReady();
  const [totalResult, statusResult, assignedResult] = await Promise.all([
    executeQuery(`
      SELECT COUNT(1) AS TotalBuses
      FROM dbo.TransportVehicles
      WHERE ISNULL(IsActive, 1) = 1;
    `),
    executeQuery(`
      SELECT CurrentStatus AS status, COUNT(1) AS count
      FROM dbo.TransportVehicles
      WHERE ISNULL(IsActive, 1) = 1
      GROUP BY CurrentStatus;
    `),
    executeQuery(`
      SELECT COUNT(1) AS TotalStudentsAssigned
      FROM dbo.StudentTransportAssignments
      WHERE Status = N'Active';
    `),
  ]);

  return {
    totalBuses: Number(totalResult?.recordset?.[0]?.TotalBuses || 0),
    byStatus: (statusResult?.recordset || []).map((row) => ({
      _id: row.status,
      count: Number(row.count || 0),
    })),
    totalStudentsAssigned: Number(assignedResult?.recordset?.[0]?.TotalStudentsAssigned || 0),
  };
};

module.exports = {
  ensureBusSqlReady,
  getBusList,
  getBusRecordById,
  createBusRecord,
  updateBusRecord,
  updateBusLocationRecord,
  assignStudentToBusRecord,
  removeStudentFromBusRecord,
  deleteBusRecord,
  getBusStatistics,
};
