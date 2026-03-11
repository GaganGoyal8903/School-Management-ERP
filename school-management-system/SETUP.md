# School Management System - Setup Guide

## Prerequisites

1. **Node.js** installed (v14 or higher)
2. **MongoDB** - Either:
   - MongoDB Atlas cloud account (free tier), OR
   - Local MongoDB installed on your machine

## Quick Start

### 1. Backend Setup

```bash
cd school-management-system/server
npm install
```

#### Option A: Using MongoDB Atlas (Cloud)

1. Create a free account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. **IMPORTANT**: Add your IP address to the Network Access whitelist:
   - Go to Network Access in Atlas
   - Click "Add IP Address"
   - Click "Allow Access from Anywhere" (0.0.0.0/0) for development
4. Get your connection string
5. Update the `.env` file with your MongoDB URI

#### Option B: Using Local MongoDB

1. Install MongoDB Community Server from https://www.mongodb.com/try/download/community
2. Start MongoDB locally: `mongod`
3. Update `.env`:
   ```
   MONGO_URI=mongodb://localhost:27017/school_management
   ```

### 2. Start Backend Server

```bash
cd school-management-system/server
node server.js
```

Expected output: `School Management Server Running on http://localhost:5000`

### 3. Start Frontend

```bash
cd school-management-system/client
npm install
npm run dev
```

Expected output: `Local: http://localhost:5173/`

## Login Credentials

After seeding the database (run `node seed.js`), use these credentials:

| Role    | Email                      | Password   |
|---------|----------------------------|------------|
| Admin   | gagan.admin@mayo.edu      | Mayo@123   |
| Teacher | vikram.teacher@mayo.edu    | Mayo@123   |
| Student | aarav@mayo.edu            | Mayo@123   |

## Seed Database

To create sample users:

```bash
cd school-management-system/server
node seed.js
```

## API Endpoints

### Authentication
- POST `/api/login` - User login
- POST `/api/register` - User registration

### Subjects
- GET `/api/subjects` - Get all subjects
- POST `/api/subjects` - Create subject
- DELETE `/api/subjects/:id` - Delete subject

### Materials
- GET `/api/materials` - Get materials (optional: ?subject=Math&grade=10)
- POST `/api/materials` - Upload material
- DELETE `/api/materials/:id` - Delete material

## Troubleshooting

### MongoDB Connection Error
If you see `MongoDB Error: Could not connect to any servers`:
1. Check your internet connection
2. Ensure MongoDB Atlas IP whitelist includes your IP
3. Verify the MONGO_URI in `.env` is correct

### Port Already in Use
```bash
# Find process using port 5000
netstat -ano | findstr :5000
# Kill it
taskkill /PID <PID> /F
```

### Frontend Build Errors
```bash
cd school-management-system/client
rm -rf node_modules package-lock.json
npm install
```

